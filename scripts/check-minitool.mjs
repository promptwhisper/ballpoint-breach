// Enforce the uploader's exact extension allowlist, not just the ZIP size budget.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script, runInNewContext } from 'node:vm';

export function getMiniToolScripts(html) {
  assert.doesNotMatch(html, /type=["']module|\son\w+=/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal(scripts.length, 2, 'Expected only the audio data and app scripts.');
  const sources = scripts.map(([, attributes, body]) => {
    assert.equal(body.trim(), '', 'Inline script bodies are not allowed.');
    assert.match(attributes, /\bdefer(?:\s|=|$)/i, 'Scripts must execute in deferred document order.');
    assert.doesNotMatch(attributes, /\basync(?:\s|=|$)/i, 'Async scripts would break the audio-before-app guarantee.');
    const source = attributes.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    assert.ok(source, 'Every script must reference a local file.');
    return source;
  });
  assert.equal(sources[0], './audio-data.js', 'Audio data must load before the app.');
  assert.match(sources[1], /^\.\/assets\/app-[A-Za-z0-9_-]{8,}\.js$/, 'The app entry must use a content-hashed local filename.');
  return { audio: sources[0], app: sources[1] };
}

export function checkMiniTool(directory = 'dist') {
  const root = resolve(directory);
  const allowed = new Set(['.jpg', '.css', '.gif', '.svg', '.png', '.js', '.jpeg', '.json', '.html', '.woff2', '.webp', '.woff']);
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        assert.ok(allowed.has(extname(file)), `Unsupported upload file: ${relative(root, file)}`);
        files.push(file);
      }
    }
  }
  walk(root);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  assert.equal(files.filter((file) => extname(file) === '.html').length, 1);
  const scripts = getMiniToolScripts(html);
  assert.equal(files.filter((file) => extname(file) === '.js').length, 2, 'Expected one bundled classic app and one audio data file.');
  const scope = { window: {} };
  runInNewContext(readFileSync(resolve(root, scripts.audio), 'utf8'), scope, { timeout: 1000 });
  const data = scope.window.AUDIO_DATA;
  assert.equal(Object.keys(data).length, 25);
  let total = 0;
  for (const [name, base64] of Object.entries(data)) {
    assert.match(base64, /^[A-Za-z0-9+/]+=*$/);
    const bytes = Buffer.from(base64, 'base64');
    assert.ok(bytes.length > 0 && bytes.length <= 100 * 1024);
    assert.deepEqual(bytes, readFileSync(resolve('public/audio', `${name}.mp3`)), `Sample changed: ${name}`);
    total += bytes.length;
  }
  assert.ok(total <= 512 * 1024);
  const app = readFileSync(resolve(root, scripts.app), 'utf8');
  new Script(app, { filename: scripts.app }); // Reject module syntax without executing the game.
  // Esbuild may emit compatibility helpers before Rollup's strict IIFE wrapper.
  assert.ok(/\(function\s*\(\s*\)\s*\{\s*["']use strict["'];/.test(app), 'The app must remain a self-contained IIFE.');
  assert.doesNotMatch(app, /createOscillator|new Audio\(|data:audio|blob:audio|\.finally\(/);
  assert.match(app, /decodeAudioData/);
  assert.match(app, /createBufferSource/);
  assert.doesNotMatch(app, /AUDIO CHECK|TEST SOUND|audio-report|getDiagnostics/);
  assert.doesNotMatch(app, /\.download\s*=|setAttribute\(\s*["']download|postNote/);
  assert.match(app, /saveImageToPhotosAlbum/);
  return { allowedFiles: files.length, appEntry: scripts.app, samples: Object.keys(data).length, sampleBytes: total, sourceBytesIdentical: true, audioDataBeforeApp: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(checkMiniTool(process.argv[2] || 'dist')));
}
