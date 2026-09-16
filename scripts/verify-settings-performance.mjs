import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8913/';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const [width, height] of [[956, 430], [430, 956]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.clear();
      window.__settingsWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) { window.__settingsWrites += 1; return original.apply(this, args); };
    });
    await page.goto(baseUrl);
    await page.locator('#start-button').tap();
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().mode === 'playing');
    await page.locator('#settings-toggle').tap();
    const layout = await page.locator('.settings-card').evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    assert.ok(layout.scrollHeight <= layout.clientHeight + 1, `settings should fit without vertical scrolling: ${JSON.stringify(layout)}`);
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `settings should fit without horizontal scrolling: ${JSON.stringify(layout)}`);
    const frameBefore = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().rendererFrame);
    await page.waitForTimeout(220);
    const frameAfter = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().rendererFrame);
    assert.equal(frameAfter, frameBefore, 'WebGL rendering should stop while settings are open');
    await page.evaluate(() => { window.__settingsWrites = 0; });
    const slider = await page.locator('#look-sensitivity').boundingBox();
    assert.ok(slider);
    const session = await context.newCDPSession(page);
    const point = fraction => width > height
      ? { x: slider.x + 12 + fraction * (slider.width - 24), y: slider.y + slider.height / 2, id: 4 }
      : { x: slider.x + slider.width / 2, y: slider.y + 12 + fraction * (slider.height - 24), id: 4 };
    const started = performance.now();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0)] });
    for (let index = 1; index <= 30; index += 1) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(index / 30)] });
    const dragMilliseconds = performance.now() - started;
    assert.equal(await page.evaluate(() => window.__settingsWrites), 0, 'slider drag must not write storage per frame');
    assert.equal(await page.locator('#sensitivity-value').textContent(), '4.0 倍');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => window.__settingsWrites), 1, 'slider should persist once on release');
    assert.ok(dragMilliseconds < 1200, `30 slider updates took ${dragMilliseconds.toFixed(1)}ms`);
    console.log(JSON.stringify({ width, height, oneScreen: true, renderPaused: true, storageWritesDuringDrag: 0, dragMilliseconds: Math.round(dragMilliseconds) }));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 430, height: 956 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?guide=1`);
  assert.ok(await page.locator('#update-guide').isVisible());
  await page.locator('#update-guide-dismiss').tap();
  await page.reload();
  assert.ok(await page.locator('#update-guide').isHidden());
  console.log(JSON.stringify({ updateGuideShownOnce: true, persistedLocally: true }));
  await context.close();
} finally {
  await browser.close();
}
