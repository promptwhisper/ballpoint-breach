import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { buildAudioData } from './scripts/build-audio-data.mjs';

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
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'audio-data.js', source: buildAudioData(fileURLToPath(new URL('./public/audio', import.meta.url))) });
        this.emitFile({ type: 'asset', fileName: 'audio/credits.json', source: readFileSync(new URL('./public/audio/credits.json', import.meta.url), 'utf8') });
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
