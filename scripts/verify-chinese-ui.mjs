import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = process.env.UI_SCREENSHOTS || '../chinese-ui-review';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const [width, height] of [[1280, 720], [956, 430], [430, 956]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
    const remote = [], errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.protocol === 'data:') return route.continue();
      remote.push(url.href); return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8912/?mode=fold-foundry');
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__?.snapshot());
    await page.evaluate(() => document.fonts.ready);
    const session = await context.newCDPSession(page);
    await session.send('DOM.enable'); await session.send('CSS.enable');
    async function verifyFont(selector, family) {
      const { root } = await session.send('DOM.getDocument');
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      assert.ok(fonts.some(font => font.familyName === family && font.isCustomFont && font.glyphCount > 0), `${selector}: ${JSON.stringify(fonts)}`);
      assert.ok(fonts.every(font => font.isCustomFont), `${selector} unexpectedly uses a fallback`);
    }
    await verifyFont('#overlay-title', 'Ballpoint Marker');
    await verifyFont('#fold-mode-button strong', 'Ballpoint Marker');
    await verifyFont('#overlay-copy', 'Ballpoint Hand');
    assert.doesNotMatch(await page.locator('body').innerText(), /SURVIVAL|BREACH|CROSSFIRE|MOVE|ATTACK|RELOAD|PAUSE/);
    await page.screenshot({ path: `${output}/menu-${width}.png` });
    await page.locator('#fold-mode-button').tap();
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().mode === 'playing');
    await page.keyboard.press('Digit5');
    await page.waitForFunction(() => document.body.dataset.reticle === 'katana');
    assert.equal(await page.locator('[data-hud="weapon-name"]').textContent(), '武士刀');
    assert.equal(await page.locator('[data-hud="ammo"]').textContent(), '∞');
    // Active ID changes halfway through the authored weapon-switch animation.
    await page.waitForTimeout(650);
    await page.keyboard.press('Digit4');
    await page.waitForFunction(() => document.body.dataset.reticle === 'sniper');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-hud="weapon-name"]').textContent(), '狙击步枪');
    await verifyFont('[data-hud="weapon-name"]', 'Ballpoint Marker');
    await verifyFont('[data-hud="wave"]', 'Ballpoint Hand');
    assert.ok(await page.evaluate(() => {
      const objective = document.querySelector('#level-objective');
      const banner = document.querySelector('#wave-banner');
      return objective.offsetTop + objective.offsetHeight < banner.offsetTop;
    }), 'Chinese objective and wave title must not overlap');
    await page.screenshot({ path: `${output}/combat-${width}.png` });
    await page.locator('#settings-toggle').tap();
    await verifyFont('#settings-title', 'Ballpoint Marker');
    await verifyFont('.settings-help', 'Ballpoint Hand');
    assert.doesNotMatch(await page.locator('body').innerText(), /SCORE|WAVE|HP|RIFLE|KATANA|ADS|SWAP|JUMP|BLOCK|PAUSED|SHARPENING/i);
    await page.screenshot({ path: `${output}/settings-${width}.png` });
    assert.deepEqual(remote, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, height, offlineFonts: true, actualCustomGlyphs: true, localizedWeaponIds: true, errors }));
    await context.close();
  }
} finally { await browser.close(); }
