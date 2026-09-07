// Enforce the uploader's exact extension allowlist, not just the ZIP size budget.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
const root = resolve(process.argv[2] || 'dist');
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
assert.doesNotMatch(html, /type=["']module|\son\w+=|<script[^>]*>\s*[^\s<]/i);
assert.equal(files.filter((file) => extname(file) === '.html').length, 1);
assert.ok(html.indexOf('./audio-data.js') < html.indexOf('./assets/app.js'));
const scope = { window: {} };
runInNewContext(readFileSync(resolve(root, 'audio-data.js'), 'utf8'), scope, { timeout: 1000 });
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
const app = readFileSync(resolve(root, 'assets/app.js'), 'utf8');
assert.doesNotMatch(app, /createOscillator|new Audio\(|data:audio|blob:audio|\.finally\(/);
assert.match(app, /decodeAudioData/);
assert.match(app, /createBufferSource/);
assert.doesNotMatch(app, /AUDIO CHECK|TEST SOUND|audio-report|getDiagnostics/);
console.log(JSON.stringify({ allowedFiles: files.length, samples: Object.keys(data).length, sampleBytes: total, sourceBytesIdentical: true, audioDataBeforeApp: true }));
