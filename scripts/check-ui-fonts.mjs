import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function checkUiFonts() {
  const files = ['index.html', 'src/style.css'];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
    }
  }
  walk('src');
  const coverage = new Set(JSON.parse(readFileSync('src/assets/fonts/coverage.json', 'utf8')).han);
  const missing = new Set();
  for (const file of files) {
    for (const char of readFileSync(file, 'utf8').match(/[\u3400-\u9fff]/gu) || []) {
      if (!coverage.has(char)) missing.add(char);
    }
  }
  assert.equal(missing.size, 0, `Rebuild UI font subsets for new characters: ${[...missing].join('')}`);
  for (const name of ['ballpoint-marker', 'ballpoint-hand']) {
    assert.equal(readFileSync(`src/assets/fonts/${name}.woff2`).subarray(0, 4).toString(), 'wOF2');
  }
  return coverage.size;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/check-ui-fonts.mjs')) {
  console.log(`Offline font coverage checked: ${checkUiFonts()} Chinese characters.`);
}
