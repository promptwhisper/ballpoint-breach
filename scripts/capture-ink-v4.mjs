import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const query = process.argv[2];
const output = resolve(process.argv[3] || 'docs/screenshots/ink-study/after-v4c.png');
if (!query) throw new Error('Pass a query string, for example "inkVersion=v4&inkStage=a".');

await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error'
      && !message.text().includes('Failed to load resource: the server responded with a status of 404')) {
      errors.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.goto(`http://127.0.0.1:8911/?style=ink&capture=1&${query}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.__IMG2THREEJS_READY__ === true);
  await page.waitForTimeout(650);
  const sample = await page.locator('#app').evaluate(canvas => {
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      width: canvas.width,
      height: canvas.height,
      contextLost: context?.isContextLost() ?? true,
      inkVersion: document.documentElement.dataset.inkVersion,
      inkDebug: window.__INK_DEBUG__?.snapshot?.(),
    };
  });
  assert.equal(sample.contextLost, false);
  assert.ok(sample.width > 1000 && sample.height > 600);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output });
  console.log(JSON.stringify({ output, query, ...sample, errors }));
} finally {
  await browser.close();
}
