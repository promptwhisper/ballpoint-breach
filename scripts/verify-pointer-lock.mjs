import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:8913/?inkVersion=v5';
const expectPointerLock = process.env.QA_EXPECT_POINTER_LOCK !== '0';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    let lockedElement = null;
    window.__qaPointerLockRequests = 0;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => lockedElement,
    });
    HTMLCanvasElement.prototype.requestPointerLock = function requestPointerLock() {
      window.__qaPointerLockRequests += 1;
      lockedElement = this;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
    document.exitPointerLock = () => {
      lockedElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    };
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.click('#start-button');
  await page.waitForFunction(() => document.querySelector('#game-overlay')?.dataset.mode === 'playing');
  const started = await page.evaluate(() => ({
    mode: document.querySelector('#game-overlay')?.dataset.mode,
    pointerLocked: document.pointerLockElement?.id ?? null,
    requests: window.__qaPointerLockRequests,
  }));
  assert.equal(started.mode, 'playing');
  assert.equal(started.requests, expectPointerLock ? 1 : 0);
  assert.equal(started.pointerLocked, expectPointerLock ? 'app' : null);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#game-overlay')?.dataset.mode === 'paused');
  const paused = await page.evaluate(() => ({
    mode: document.querySelector('#game-overlay')?.dataset.mode,
    pointerLocked: document.pointerLockElement?.id ?? null,
  }));
  assert.deepEqual(paused, { mode: 'paused', pointerLocked: null });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ baseUrl, expectPointerLock, started, paused, errors }));
} finally {
  await browser.close();
}
