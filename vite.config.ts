import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { buildAudioData } from './scripts/build-audio-data.mjs';

const miniToolVisualAssets = [
  ['public/fonts/bb-ink-display-cjk.woff2', 'fonts/bb-ink-display-cjk.woff2'],
  ['public/fonts/bb-wenkai-ui-cjk.woff2', 'fonts/bb-wenkai-ui-cjk.woff2'],
  ['public/fonts/bb-wenkai-ui-latin.woff2', 'fonts/bb-wenkai-ui-latin.woff2'],
  ['public/textures/ink/ink-brush-field.webp', 'textures/ink/ink-brush-field.webp'],
  ['public/textures/ink/xuan-paper.webp', 'textures/ink/xuan-paper.webp'],
  ['public/textures/ink/weapon-dry-brush.webp', 'textures/ink/weapon-dry-brush-hero.webp'],
  ['public/textures/ink/npc-wet-wash.webp', 'textures/ink/npc-wet-wash-hero.webp'],
  ['public/textures/ink/pale-ground-v5.webp', 'textures/ink/pale-ground-v5.webp'],
  ['public/textures/ink/pale-sky-v5.webp', 'textures/ink/pale-sky-v5.webp'],
] as const;

export default defineConfig(({ mode }) => {
  const miniTool = mode === 'minitool';
  return {
    base: './',
    publicDir: miniTool ? false : 'public',
    resolve: miniTool ? {
      alias: {
        './runtime/canvasRecorder': fileURLToPath(new URL('./src/runtime/canvasRecorder.minitool.ts', import.meta.url)),
        '../audio/AudioSystem': fileURLToPath(new URL('./src/audio/AudioSystem.minitool.ts', import.meta.url)),
      },
    } : undefined,
    build: {
      target: ['es2017', 'chrome61'],
      cssTarget: 'chrome61',
      sourcemap: false,
      rollupOptions: miniTool ? {
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: 'assets/app.js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      } : undefined,
    },
    plugins: miniTool ? [{
      name: 'mini-tool-classic-script',
      enforce: 'post',
      generateBundle(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'audio-data.js', source: buildAudioData(fileURLToPath(new URL('./public/audio', import.meta.url))) });
        this.emitFile({ type: 'asset', fileName: 'audio/credits.json', source: readFileSync(new URL('./public/audio/credits.json', import.meta.url), 'utf8') });
        for (const [sourcePath, fileName] of miniToolVisualAssets) {
          this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(`./${sourcePath}`, import.meta.url)) });
        }
        for (const output of Object.values(bundle)) {
          if (output.type !== 'asset' || !output.fileName.endsWith('.css') || typeof output.source !== 'string') continue;
          output.source = output.source.replace(/url\(\/fonts\//g, 'url(../fonts/');
        }
      },
      transformIndexHtml(html) {
        return html
          .replace(/\s+type="module"/g, '')
          .replace(/\s+crossorigin/g, '')
          .replace('<script src=', '<script src="./audio-data.js" defer></script>\n    <script defer src=');
      },
    }] : [],
  };
});
