import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

mkdirSync('docs/screenshots/battle-card', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 956, height: 430 }, hasTouch: true });
  await context.addInitScript(() => {
    window.__BATTLE_CARD_CALLS__ = [];
    window.xhs = { miniTool: {
      writeTempFile: async ({ data }) => {
        window.__BATTLE_CARD_CALLS__.push({ type: 'write', prefix: data.slice(0, 22), length: data.length });
        return { filePath: 'xhs://temp/battle-card.png' };
      },
      saveImageToPhotosAlbum: async ({ filePath }) => {
        window.__BATTLE_CARD_CALLS__.push({ type: 'save', filePath });
      },
    } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8912/?capture=1&defeat=1&mode=classic');
  await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__?.snapshot().mode === 'defeat');
  assert.equal(await page.locator('#save-card-button').isVisible(), true);
  assert.equal(await page.locator('#save-card-button').textContent(), '保存战报');
  await page.screenshot({ path: 'docs/screenshots/battle-card/game-over.png' });
  await page.locator('#save-card-button').click();
  await page.waitForFunction(() => document.querySelector('#share-status')?.dataset.state === 'saved');
  const calls = await page.evaluate(() => window.__BATTLE_CARD_CALLS__);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].prefix, 'data:image/png;base64,');
  assert.ok(calls[0].length > 50_000, 'generated battle card should contain a rendered game frame');
  assert.deepEqual(calls[1], { type: 'save', filePath: 'xhs://temp/battle-card.png' });
  assert.match(await page.locator('#share-status').textContent(), /已保存到相册/);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ visibleAfterDefeat: true, generatedPngBytes: calls[0].length, savedToAlbum: true, errors }));
} finally {
  await browser.close();
}
