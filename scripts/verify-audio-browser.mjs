// Local-only browser QA. Uses the installed Chrome and a caller-provided Playwright.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// Standard Vite ES-module builds require HTTP; only classic builds support file://.
const supportsFileEntry = !(await readFile('dist/index.html', 'utf8')).includes('type="module"');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/nested\//, '/');
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (pathname.includes('..')) throw new Error('Invalid path');
    const bytes = await readFile(resolve('dist', `.${pathname === '/' ? '/index.html' : pathname}`));
    res.setHeader('Content-Type', mime[extname(pathname)] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'");
    // Intentionally no Range support: some offline hosts cannot seek in sprites.
    res.setHeader('Content-Length', bytes.length);
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required', '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'] });
  for (const scenario of [
    { viewport: { width: 430, height: 956 }, url: `${base}/nested/index.html`, label: 'portrait-no-range-csp' },
    { viewport: { width: 956, height: 430 }, url: `${base}/nested/index.html`, label: 'landscape-no-range-csp' },
    { viewport: { width: 430, height: 956 }, url: pathToFileURL(resolve('dist/index.html')).href, label: 'offline-file' },
  ].filter((scenario) => supportsFileEntry || scenario.label !== 'offline-file')) {
    const { viewport } = scenario;
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.addInitScript(() => {
      window.__audioQA = { media: [], plays: [], failures: [] };
      const NativeAudio = window.Audio;
      window.Audio = function (...args) {
        const media = new NativeAudio(...args);
        window.__audioQA.media.push(media);
        const play = media.play.bind(media);
        media.play = function () {
          const call = { src: media.src, ok: false };
          window.__audioQA.plays.push(call);
          const result = play();
          result.then(() => { call.ok = true; }).catch((error) => window.__audioQA.failures.push(error.name));
          return result;
        };
        return media;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
    await page.goto(scenario.url);
    await page.locator('#start-button').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__audioQA.media.length), 0);
    await page.locator('#start-button').tap();
    await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
    const point = viewport.width < viewport.height ? { x: 210, y: 600 } : { x: 600, y: 180 };
    for (let i = 0; i < 3; i += 1) {
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForTimeout(160);
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const shots = await page.evaluate(() => window.__audioQA.plays.filter((p) => p.ok && p.src.endsWith('/rifle.mp3')).length);
    if (shots < 4) {
      console.log(JSON.stringify(await page.evaluate(() => ({ plays: window.__audioQA.plays, failures: window.__audioQA.failures, game: window.__SCRIBBLE_SIEGE__.snapshot(), audio: window.__audioQA.media.map((m) => ({ ready: m.readyState, time: m.currentTime, error: m.error?.message })) }))));
      await page.screenshot({ path: '/tmp/ballpoint-audio-failure.png' });
    }
    assert.ok(shots >= 4, `Expected repeated sampled shots, got ${shots}`);
    const ammoBefore = await page.locator('[data-hud="ammo"]').textContent();
    await page.locator('#sound-toggle').tap();
    assert.equal(await page.locator('#sound-toggle').getAttribute('data-audio-status'), 'muted');
    assert.equal(await page.locator('[data-hud="ammo"]').textContent(), ammoBefore);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#sound-toggle').getAttribute('data-audio-status'), 'muted');
    await page.locator('#sound-toggle').tap();
    await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
    // Simulated visibility is a lifecycle check, not a real phone background test.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.ok(await page.evaluate(() => window.__audioQA.media.every((m) => m.paused)));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
    const result = await page.evaluate(() => ({ count: window.__audioQA.media.length, ready: window.__audioQA.media.every((m) => m.readyState >= 2 && !m.error && m.duration > 0), failures: window.__audioQA.failures.filter((name) => name !== 'AbortError') }));
    assert.equal(result.count, 6);
    assert.ok(result.ready);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ scenario: scenario.label, viewport, sampledShots: shots, ...result, errors }));
    await page.screenshot({ path: `/tmp/ballpoint-audio-${viewport.width}.png` });
    await context.close();
  }
} finally {
  await browser?.close();
  server.close();
}
