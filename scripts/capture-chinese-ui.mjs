import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.url()); });
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5', { waitUntil:'networkidle' });
  await page.waitForFunction(() => window.__IMG2THREEJS_READY__);
  await page.evaluate(() => document.fonts.ready);
  const screenshot = async name => page.screenshot({ path: resolve(`docs/screenshots/ink-study/chinese-ui-${name}.png`) });
  const verifyCopy = async () => {
    const text = await page.locator('body').innerText();
    assert.doesNotMatch(text, /[a-zA-Z]/, text);
  };
  await verifyCopy();
  const typography = await page.evaluate(() => {
    const family = selector => getComputedStyle(document.querySelector(selector)).fontFamily;
    return {
      brush: ['#overlay-ink-title', '#overlay-title', '#overlay-copy', '#start-button',
        '.hud-wave strong', '.hud-weapons>strong', '.hud-weapons li>span', '#context-tip',
        '#wave-banner-title', '#wave-banner-subtitle'].map(family),
      ui: family('.settings-help'),
      ammo: family('.hud-ammo strong'),
      health: family('.hud-health b'),
    };
  });
  for (const family of typography.brush) assert.ok(family.startsWith('"BB Ink Display"'), family);
  assert.ok(typography.ui.startsWith('"BB WenKai UI"'));
  assert.ok(!typography.ammo.includes('BB Ink Display') && !typography.health.includes('BB Ink Display'));
  await screenshot('menu');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__IMG2THREEJS_CAPTURE__.snapshot().mode === 'playing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__IMG2THREEJS_CAPTURE__.snapshot().mode === 'paused');
  await page.locator('#overlay-title').click();
  await page.waitForFunction(() => window.__IMG2THREEJS_CAPTURE__.snapshot().mode === 'playing');
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5', { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const mode of ['paused', 'defeat', 'victory']) {
    await page.evaluate(async mode => {
      const { Hud } = await import('/src/ui/Hud.ts');
      new Hud().setMode(mode);
    }, mode);
    await page.evaluate(() => document.fonts.ready);
    await verifyCopy();
    await screenshot(mode);
  }
  const labels = await page.evaluate(async () => {
    const { Hud } = await import('/src/ui/Hud.ts');
    const { MESSAGE_COPY } = await import('/src/ui/zhCN.ts');
    const hud = new Hud();
    const outputs = [];
    for (const message of [...Object.keys(MESSAGE_COPY), ...[1,2,3,4,5].flatMap(n => [`weapon ${n} ready`, `WAVE ${n}`])]) {
      hud.showTip(message);
      outputs.push(document.querySelector('#context-tip').textContent);
    }
    const names = ['RIFLE','SHOTGUN','REVOLVER','SNIPER','KATANA'];
    const weaponLabels = names.map((name, index) => {
      hud.render({ score:1234, wave:5, enemiesLeft:7, health:82, maxHealth:100,
        weapons:[{slot:index+1,name,description:'fallback should never be visible',ammo:5,reserve:30,selected:true}],
        boss:{name:'THE DOODLER',health:500,maxHealth:1000} });
      return {name:document.querySelector('[data-hud="weapon-name"]').textContent,
        hint:document.querySelector('[data-hud="weapon-description"]').textContent,
        reticle:document.body.dataset.reticle};
    });
    return {outputs,weaponLabels};
  });
  for (const text of labels.outputs) assert.doesNotMatch(text.replace(/\bQ\b/g,''), /[a-zA-Z]/);
  for (const weapon of labels.weaponLabels) assert.doesNotMatch(weapon.name + weapon.hint, /[a-zA-Z]/);
  assert.equal(labels.weaponLabels[4].reticle,'katana');
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5&capture=1', {waitUntil:'networkidle'});
  await page.evaluate(() => document.fonts.ready);
  await verifyCopy();
  await screenshot('gameplay');
  await page.setViewportSize({width:896,height:560});
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5', {waitUntil:'networkidle'});
  await page.evaluate(() => document.fonts.ready);
  await verifyCopy();
  const box = await page.locator('.overlay-card').boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 561, JSON.stringify(box));
  await screenshot('compact');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ errors, testedModes:['start','paused','defeat','victory','playing'], compactMenu:box, ...labels },null,2));
} finally { await browser.close(); }
