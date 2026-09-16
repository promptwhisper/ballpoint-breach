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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('qa-cleared')) {
        localStorage.clear();
        sessionStorage.setItem('qa-cleared', '1');
      }
    });
    await page.goto(baseUrl);
    await page.locator('#start-button').tap();
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().mode === 'playing');
    assert.equal((await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot())).difficulty, 'relaxed');
    await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__.snapshot().waveRemaining > 0);
    const relaxedBefore = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot());
    await page.locator('#settings-toggle').tap();
    assert.ok(await page.locator('[name="difficulty"][value="relaxed"]').isChecked());
    await page.locator('[name="difficulty"][value="challenge"]').check();
    const challenge = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot());
    assert.equal(challenge.incomingDamageScale, 1);
    assert.equal(challenge.waveRemaining, relaxedBefore.waveRemaining, 'difficulty must preserve the full enemy count');
    assert.ok(challenge.waveMaxConcurrent > relaxedBefore.waveMaxConcurrent);
    assert.ok(challenge.waveSpawnInterval < relaxedBefore.waveSpawnInterval);
    await page.locator('[name="difficulty"][value="relaxed"]').check();
    const relaxedAfter = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot());
    assert.equal(relaxedAfter.incomingDamageScale, 0.18);
    assert.equal(relaxedAfter.enemyTimeScale, 0.62);
    assert.equal(relaxedAfter.outgoingDamageScale, 1.35);
    assert.equal(relaxedAfter.waveRemaining, challenge.waveRemaining, 'relaxed must keep every current-wave enemy');
    assert.ok(relaxedAfter.waveMaxConcurrent < challenge.waveMaxConcurrent);
    assert.ok(relaxedAfter.waveSpawnInterval > challenge.waveSpawnInterval);
    await page.locator('#auto-fire').check();
    await page.locator('[name="fire-mode"][value="button"]').check();
    await page.locator('#edit-controls').tap();
    assert.ok(await page.locator('#control-layout-editor').isVisible());
    const fire = await page.locator('.action-fire').boundingBox();
    assert.ok(fire);
    const start = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2 };
    const end = width > height ? { x: start.x - 42, y: start.y - 24 } : { x: start.x + 24, y: start.y - 42 };
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 9 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 9 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const aim = await page.locator('.action-aim').boundingBox();
    assert.ok(aim);
    const aimStart = { x: aim.x + aim.width / 2, y: aim.y + aim.height / 2 };
    const aimEnd = width > height ? { x: aimStart.x - 30, y: aimStart.y - 36 } : { x: aimStart.x + 36, y: aimStart.y - 30 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...aimStart, id: 10 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...aimEnd, id: 10 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.locator('#finish-controls').tap();
    await page.locator('#settings-close').tap();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ballpoint-player-settings-v1')));
    assert.equal(stored.autoFire, true);
    assert.equal(stored.difficulty, 'relaxed');
    assert.ok(stored.controlLayout.fire);
    assert.ok(stored.controlLayout.aim);
    assert.equal((await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot())).autoFire, true);
    await page.reload();
    assert.ok(await page.locator('.action-fire').evaluate(element => element.classList.contains('custom-position')));
    assert.ok(await page.locator('.action-aim').evaluate(element => element.classList.contains('custom-position')));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, height, fullEnemyCountPreserved: relaxedAfter.waveRemaining === challenge.waveRemaining, autoFire: true, individualButtonsPersisted: true }));
    await context.close();
  }
} finally {
  await browser.close();
}
