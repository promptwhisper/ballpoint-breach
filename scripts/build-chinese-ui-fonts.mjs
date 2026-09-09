import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path)
      : /\.(ts|css)$/.test(path) && !path.endsWith('.test.ts') ? [path] : [];
  });
}
const source = ['index.html', ...sourceFiles('src')].map(path => readFileSync(path, 'utf8')).join('\n');
const uiGlyphs = [...new Set(source.match(/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/gu))].sort().join('');
const targets = [
  ['assets-source/fonts/LongCang-Regular.ttf', 'public/fonts/bb-ink-display-cjk.woff2', uiGlyphs],
  ['assets-source/fonts/LXGWWenKai-Regular.ttf', 'public/fonts/bb-wenkai-ui-cjk.woff2', uiGlyphs],
];
for (const [input, output, text] of targets) {
  const result = spawnSync('uvx', ['--from', 'fonttools[woff]', 'pyftsubset', input,
    `--output-file=${output}`, '--flavor=woff2', `--text=${text}`, '--layout-features=*',
    '--name-IDs=*', '--name-legacy', '--name-languages=*'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Font subset failed: ${input}`);
  console.log(`${output}: ${text.length} glyphs requested`);
}
