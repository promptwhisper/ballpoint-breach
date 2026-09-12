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
const relativeFiles = new Set(files.map((file) => relative(root, file)));
for (const required of [
  'fonts/bb-ink-display-cjk.woff2',
  'fonts/bb-wenkai-ui-cjk.woff2',
  'fonts/bb-wenkai-ui-latin.woff2',
  'textures/ink/ink-brush-field.webp',
  'textures/ink/xuan-paper.webp',
  'textures/ink/weapon-dry-brush-hero.webp',
  'textures/ink/npc-wet-wash-hero.webp',
  'textures/ink/pale-ground-v5.webp',
  'textures/ink/pale-sky-v5.webp',
]) assert.ok(relativeFiles.has(required), `Missing mini-tool visual asset: ${required}`);
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
assert.doesNotMatch(html, /type=["']module|\son\w+=|<script[^>]*>\s*[^\s<]/i);
assert.doesNotMatch(html, /(?:src|href)=["']\//i);
assert.doesNotMatch(html, /controls-grid|W\s*A\s*S\s*D|上档键|鼠标(?:左|右)键|退出键/);
assert.equal(files.filter((file) => extname(file) === '.html').length, 1);
assert.ok(html.indexOf('./audio-data.js') < html.indexOf('./assets/app.js'));
const scope = { window: {} };
runInNewContext(readFileSync(resolve(root, 'audio-data.js'), 'utf8'), scope, { timeout: 1000 });
const data = scope.window.AUDIO_DATA;
const audioManifest = JSON.parse(readFileSync(resolve('public/audio/credits.json'), 'utf8'));
assert.equal(Object.keys(data).length, audioManifest.assets.filter((name) => name.endsWith('.mp3') && name !== 'unlock.mp3').length);
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
const cssFile = files.find((file) => extname(file) === '.css');
const css = cssFile ? readFileSync(cssFile, 'utf8') : '';
assert.match(app, /BB Ink Display/);
assert.doesNotMatch(`${app}\n${css}`, /(?:url\(|["'`])\/(?:fonts|textures)\//);
assert.doesNotMatch(app, /createOscillator|new Audio\(|data:audio|blob:audio|\.finally\(/);
assert.match(app, /decodeAudioData/);
assert.match(app, /createBufferSource/);
assert.doesNotMatch(app, /AUDIO CHECK|TEST SOUND|audio-report|getDiagnostics/);
const uploadBytes = files.reduce((sum, file) => sum + readFileSync(file).byteLength, 0);
assert.ok(uploadBytes <= 10 * 1024 * 1024, `Mini-tool package exceeds 10 MiB: ${uploadBytes}`);
console.log(JSON.stringify({ allowedFiles: files.length, uploadBytes, samples: Object.keys(data).length, sampleBytes: total, sourceBytesIdentical: true, audioDataBeforeApp: true, inkAssets: 9 }));
