import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = process.env.LEVEL_SCREENSHOTS || '../tactical-level-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-unsafe-swiftshader'],
});
try {
  for (const mode of ['fold-foundry', 'dual-pages']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8912/?mode=' + mode);
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__?.snapshot());
    await page.mouse.move(640, 360);
    await page.locator(mode === 'fold-foundry' ? '#fold-mode-button' : '#pages-mode-button').tap();
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().mode === 'playing');
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().enemies >= 2);
    await page.screenshot({ path: `${output}/${mode}-entry.png` });
    const start = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot());
    const route = mode === 'fold-foundry'
      ? [['KeyA', 1950], ['KeyW', 5000]]
      : [['KeyW', 3100]];
    // Normal gameplay input: no capture mode, teleport, invulnerability or autoplay.
    for (const [key, duration] of route) {
      await page.keyboard.down(key);
      await page.waitForTimeout(duration);
      await page.keyboard.up(key);
    }
    const end = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot());
    await page.mouse.move(1000, 360, { steps: 12 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${output}/${mode}-approach.png` });
    assert.equal(end.mode, 'playing');
    assert.ok(end.position[2] < start.position[2] - 12, 'normal controls can advance from spawn');
    assert.ok(end.enemies <= 14);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, start: start.position, end: end.position,
      health: end.playerHealth, enemies: end.enemies, renderObjects: end.rendererObjects, errors }));
    await page.close();
  }
} finally { await browser.close(); }
