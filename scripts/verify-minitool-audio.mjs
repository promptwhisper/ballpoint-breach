import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/nested\//, '/');
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (pathname.includes('..')) throw new Error('Invalid path');
    const bytes = await readFile(resolve('dist', `.${pathname === '/' ? '/index.html' : pathname}`));
    res.setHeader('Content-Type', mime[extname(pathname)] || 'application/octet-stream');
    // Stronger than the documented media policy: no media URLs of any kind.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'none'; connect-src 'none'; worker-src 'none'; object-src 'none'");
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
    { width: 430, height: 956, label: 'portrait-csp' },
    { width: 956, height: 430, label: 'landscape-csp' },
    { width: 430, height: 956, label: 'webkit-alias' },
    { width: 956, height: 430, label: 'session-playback' },
    { width: 430, height: 956, label: 'session-denied' },
    { width: 430, height: 956, label: 'unsupported' },
  ]) {
    const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, hasTouch: true });
    await context.addInitScript(({ label }) => {
      window.__audioQA = { contexts: [], decodes: 0, starts: [], active: 0, maxActive: 0, unhandled: [] };
      window.addEventListener('unhandledrejection', (event) => window.__audioQA.unhandled.push(String(event.reason)));
      const Native = window.AudioContext;
      let sessionType = 'auto';
      Object.defineProperty(navigator, 'audioSession', { configurable: true, value:
        label.startsWith('session-') ? {
          get type() { return sessionType; },
          set type(value) { if (label === 'session-denied') throw new Error('HostDenied'); sessionType = value; },
          state: 'active',
        } : undefined,
      });
      class ObservedAudioContext extends Native {
        constructor(...args) {
          super(...args);
          window.__audioQA.contexts.push(this);
          const decode = this.decodeAudioData.bind(this);
          this.decodeAudioData = (...args) => {
            window.__audioQA.decodes += 1;
            return decode(...args);
          };
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const node = create();
            const start = node.start.bind(node);
            const stop = node.stop.bind(node);
            let active = false;
            const ended = () => { if (active) { active = false; window.__audioQA.active -= 1; } };
            node.addEventListener('ended', ended);
            node.stop = (...args) => { ended(); return stop(...args); };
            node.start = (...args) => {
              const samples = node.buffer?.getChannelData(0) || [];
              let peak = 0;
              for (const value of samples) peak = Math.max(peak, Math.abs(value));
              window.__audioQA.starts.push({ peak, duration: node.buffer?.duration });
              active = true;
              window.__audioQA.active += 1;
              window.__audioQA.maxActive = Math.max(window.__audioQA.maxActive, window.__audioQA.active);
              return start(...args);
            };
            return node;
          };
        }
      }
      window.AudioContext = label === 'unsupported' || label === 'webkit-alias' ? undefined : ObservedAudioContext;
      window.webkitAudioContext = label === 'webkit-alias' ? ObservedAudioContext : undefined;
    }, scenario);
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const failedRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => requests.push(request.url()));
    page.on('requestfailed', (request) => failedRequests.push(`${request.url()} · ${request.failure()?.errorText ?? 'failed'}`));
    page.on('response', (response) => { if (response.status() >= 400) failedRequests.push(`${response.url()} · ${response.status()}`); });
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    // Packaged XHS resources run under the container origin. Raw file:// is not a
    // supported rendering host because browsers forbid local images in WebGL.
    await page.goto(`${base}/nested/index.html`);
    await page.locator('#start-button').waitFor({ state: 'visible' });
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        display: document.fonts.check('32px "BB Ink Display"', '破阵十墨'),
        ui: document.fonts.check('16px "BB WenKai UI"', '设置灵敏度音效'),
      };
    });
    assert.deepEqual(fonts, { display: true, ui: true });
    assert.equal(await page.locator('#audio-check').count(), 0, 'temporary audio diagnostics must not ship');
    assert.equal(await page.evaluate(() => window.__audioQA.contexts.length), 0);
    await page.locator('#start-button').tap();
    if (scenario.label === 'unsupported') {
      await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'unsupported');
      assert.ok(await page.locator('#sound-toggle').isDisabled());
      assert.equal(await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().mode), 'playing');
    } else {
      await page.waitForFunction(() => window.__audioQA.decodes === 25 && document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
      const initialStarts = await page.evaluate(() => window.__audioQA.starts);
      assert.ok(initialStarts.length <= 1, 'audio unlock must not create extra playback');
      if (initialStarts[0]) assert.ok(Math.abs(initialStarts[0].duration - 1.2) < 0.04, `only the opening-wave cue may play after unlock: ${JSON.stringify(initialStarts)}`);
      if (scenario.label === 'session-playback') assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback');
      await page.keyboard.down('w');
      await page.waitForTimeout(1250);
      await page.keyboard.up('w');
      assert.ok(await page.evaluate(() => window.__audioQA.starts.some((entry) => Math.abs(entry.duration - 0.28) < 0.03)), 'walking must play sampled footsteps');
      const point = scenario.width < scenario.height ? { x: 210, y: 600 } : { x: 600, y: 180 };
      const cdp = await context.newCDPSession(page);
      for (let i = 0; i < 3; i += 1) { await page.touchscreen.tap(point.x, point.y); await page.waitForTimeout(160); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => window.__audioQA.starts.length >= 4));
      const ammo = await page.locator('[data-hud="ammo"]').textContent();
      await page.locator('#settings-toggle').tap();
      await page.locator('#sound-toggle').tap();
      assert.equal(await page.locator('#sound-toggle').getAttribute('data-audio-status'), 'muted');
      if (scenario.label === 'session-playback') assert.equal(await page.evaluate(() => navigator.audioSession.type), 'auto');
      assert.equal(await page.locator('[data-hud="ammo"]').textContent(), ammo);
      await page.locator('#settings-close').tap();
      const startedBefore = await page.evaluate(() => window.__audioQA.starts.length);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__audioQA.starts.length), startedBefore);
      await page.locator('#settings-toggle').tap();
      await page.locator('#sound-toggle').tap();
      await page.locator('#settings-close').tap();
      await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
      assert.equal(await page.evaluate(() => window.__audioQA.active), 0);
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForFunction(() => document.querySelector('#sound-toggle').dataset.audioStatus === 'ready');
    }
    const result = await page.evaluate(() => ({ contexts: window.__audioQA.contexts.length, decodes: window.__audioQA.decodes, plays: window.__audioQA.starts.length,
      nonSilent: window.__audioQA.starts.length ? window.__audioQA.starts.every((s) => s.peak > 0.01) : null, maxVoices: window.__audioQA.maxActive, unhandled: window.__audioQA.unhandled }));
    assert.notEqual(result.nonSilent, false);
    assert.ok(result.maxVoices <= 6);
    assert.deepEqual(result.unhandled, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    assert.ok(!requests.some((url) => /\.(mp3|wav|ogg)(?:$|\?)/.test(url) || /^(blob:|data:audio)/.test(url)));
    console.log(JSON.stringify({ scenario: scenario.label, ...result, mediaRequests: 0, errors }));
    await context.close();
  }
} finally { await browser?.close(); server.close(); }
