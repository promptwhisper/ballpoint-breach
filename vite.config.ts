import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { buildAudioData } from './scripts/build-audio-data.mjs';
import { checkUiFonts } from './scripts/check-ui-fonts.mjs';

export default defineConfig(({ mode }) => {
  checkUiFonts();
  const miniTool = mode === 'minitool';
  return {
    base: './',
    publicDir: miniTool ? false : 'public',
    resolve: miniTool ? {
      alias: {
        './runtime/canvasRecorder': fileURLToPath(new URL('./src/runtime/canvasRecorder.minitool.ts', import.meta.url)),
        '../audio/AudioSystem': fileURLToPath(new URL('./src/audio/AudioSystem.minitool.ts', import.meta.url)),
        '../social/saveBattleCard': fileURLToPath(new URL('./src/social/saveBattleCard.minitool.ts', import.meta.url)),
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
          // Embedded browsers may retain JS across HTML reloads. Change the URL
          // whenever gameplay changes, including in offline mini-tool packages.
          entryFileNames: 'assets/app-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      } : undefined,
    },
    plugins: [{
      name: 'offline-font-licenses',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'fonts/licenses.json', source: readFileSync(new URL('./src/assets/fonts/licenses.json', import.meta.url), 'utf8') });
      },
    }, ...(miniTool ? [{
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
    }] : [])],
  };
});
