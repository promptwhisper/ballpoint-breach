import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { build } from 'vite';
import { getMiniToolScripts } from './check-minitool.mjs';

const validHtml = '<script src="./audio-data.js" defer></script><script defer src="./assets/app-Abcd1234.js"></script>';

test('mini-tool references a local hashed classic entry after deferred audio data', () => {
  assert.deepEqual(getMiniToolScripts(validHtml), { audio: './audio-data.js', app: './assets/app-Abcd1234.js' });
  for (const html of [
    validHtml.replace('app-Abcd1234.js', 'app.js'),
    validHtml.replace('defer src=', 'type="module" defer src='),
    validHtml.replace('src="./audio-data.js" defer', 'src="./audio-data.js"'),
    validHtml.replace('defer src=', 'async defer src='),
    validHtml.replace('./assets/', 'https://example.com/assets/'),
    validHtml.replace('></script>', '>window.bad = true;</script>'),
    validHtml.replace('src="./audio-data.js"', 'src="./assets/app-Abcd1234.js"'),
  ]) assert.throws(() => getMiniToolScripts(html));
});

test('mini-tool app URL changes with entry content, but remains stable for identical builds', async () => {
  async function entryFor(revision) {
    const result = await build({
      mode: 'minitool',
      logLevel: 'silent',
      build: { write: false }, // Never replace a running preview's dist directory.
      plugins: [{
        name: 'mini-tool-cache-regression-fixture',
        renderChunk(code, chunk) {
          if (chunk.isEntry) return { code: `${code}\nwindow.__MINITOOL_CACHE_TEST__ = ${revision};`, map: null };
          return null;
        },
      }],
    });
    assert.ok(!Array.isArray(result));
    const html = result.output.find((file) => file.fileName === 'index.html');
    assert.ok(html?.type === 'asset');
    const scripts = getMiniToolScripts(String(html.source));
    const app = result.output.find((file) => file.fileName === scripts.app.slice(2));
    assert.ok(app?.type === 'chunk' && app.isEntry);
    assert.equal(app.imports.length, 0);
    assert.equal(app.dynamicImports.length, 0);
    new Script(app.code);
    const audio = result.output.find((file) => file.fileName === 'audio-data.js');
    assert.ok(audio?.type === 'asset');
    return { url: scripts.app, audio: String(audio.source) };
  }
  const first = await entryFor(1);
  const identical = await entryFor(1);
  const changed = await entryFor(2);
  assert.equal(first.url, identical.url, 'Identical content should reuse its hash.');
  assert.notEqual(first.url, changed.url, 'Different entry content must invalidate embedded-browser JS caches.');
  assert.equal(first.audio, changed.audio, 'Changing the gameplay entry must not change sampled audio bytes.');
  console.log(JSON.stringify({ cacheRegression: true, originalEntry: first.url, changedEntry: changed.url }));
});
