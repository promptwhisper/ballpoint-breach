import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const outputDirectory = resolve('docs/screenshots/ink-study');
const baseUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:8911';

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

const errors = [];
const attachDiagnostics = (page) => {
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
};

const waitForSceneAndFonts = async (page) => {
  await page.waitForFunction(() => window.__IMG2THREEJS_READY__ === true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
};

try {
  const menuPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attachDiagnostics(menuPage);
  await menuPage.goto(`${baseUrl}/?style=ink&inkVersion=v4`, { waitUntil: 'networkidle' });
  await waitForSceneAndFonts(menuPage);

  const menuTypography = await menuPage.evaluate(async () => {
    const fontOf = (selector) => getComputedStyle(document.querySelector(selector)).fontFamily;
    await Promise.all([
      document.fonts.load('72px "BB Ink Display"', '破阵'),
      document.fonts.load('16px "BB WenKai UI"', 'Mission'),
      document.fonts.load('16px "BB WenKai UI"', '任务'),
    ]);
    const displayFontLoaded = document.fonts.check('72px "BB Ink Display"', '破阵');
    const uiLatinFontLoaded = document.fonts.check('16px "BB WenKai UI"', 'Mission');
    const uiCjkFontLoaded = document.fonts.check('16px "BB WenKai UI"', '任务');
    const rasterSignature = (family) => {
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = 150;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000';
      context.font = `100px ${family}`;
      context.fillText('破阵', 20, 108);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      let weighted = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        alpha = (alpha + pixels[index]) >>> 0;
        weighted = (weighted + pixels[index] * ((index / 4) % 1009)) >>> 0;
      }
      return { alpha, weighted };
    };
    const longCangSignature = rasterSignature('"BB Ink Display"');
    const systemSignature = rasterSignature('Arial, sans-serif');
    return {
      displayFontLoaded,
      uiLatinFontLoaded,
      uiCjkFontLoaded,
      display: fontOf('#overlay-ink-title'),
      englishTitle: fontOf('#overlay-title'),
      bodyCopy: fontOf('#overlay-copy'),
      controls: fontOf('.controls-grid'),
      number: fontOf('.controls-grid b'),
      longCangSignature,
      systemSignature,
    };
  });
  assert.equal(menuTypography.displayFontLoaded, true);
  assert.equal(menuTypography.uiLatinFontLoaded, true);
  assert.equal(menuTypography.uiCjkFontLoaded, true);
  assert.notDeepEqual(menuTypography.longCangSignature, menuTypography.systemSignature);

  await menuPage.screenshot({ path: resolve(outputDirectory, 'font-after-menu.png') });
  const titleBox = await menuPage.locator('.overlay-card').boundingBox();
  assert.ok(titleBox);
  const titlePadding = 20;
  await menuPage.screenshot({
    path: resolve(outputDirectory, 'font-after-title.png'),
    clip: {
      x: Math.max(0, titleBox.x - titlePadding),
      y: Math.max(0, titleBox.y - titlePadding),
      width: Math.min(1440 - Math.max(0, titleBox.x - titlePadding), titleBox.width + titlePadding * 2),
      height: Math.min(900 - Math.max(0, titleBox.y - titlePadding), titleBox.height + titlePadding * 2),
    },
  });

  // Deliberately temporary B-test: prove why the display face must not become the UI face.
  await menuPage.evaluate(() => {
    document.documentElement.style.setProperty('--font-ui', 'var(--font-ink-display)');
    document.querySelector('.eyebrow').textContent = '第一章 · 禁区';
    document.querySelector('#overlay-copy').textContent = '暂停 · 胜 · 败';
    document.querySelector('#start-button').textContent = '进入旧城禁区';
    for (const [index, item] of [...document.querySelectorAll('.controls-grid span')].entries()) {
      item.textContent = `第${'一二三四五'[index % 5]} · 破阵`;
    }
  });
  await menuPage.screenshot({ path: '/tmp/ballpoint-breach-font-all-display.png' });

  const gameplayPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  attachDiagnostics(gameplayPage);
  await gameplayPage.goto(`${baseUrl}/?style=ink&inkVersion=v4&capture=1`, { waitUntil: 'networkidle' });
  await waitForSceneAndFonts(gameplayPage);
  const gameplayTypography = await gameplayPage.evaluate(() => {
    const details = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return {
        family: style.fontFamily,
        size: style.fontSize,
        color: style.color,
        weight: style.fontWeight,
      };
    };
    return {
      scoreLabel: details('.hud-score'),
      scoreNumber: details('.hud-score strong'),
      ammoNumber: details('.hud-ammo strong'),
      weaponLabel: details('[data-hud="weapon-name"]'),
    };
  });
  await gameplayPage.screenshot({ path: resolve(outputDirectory, 'font-after-gameplay.png') });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    screenshots: {
      menu: resolve(outputDirectory, 'font-after-menu.png'),
      title: resolve(outputDirectory, 'font-after-title.png'),
      gameplay: resolve(outputDirectory, 'font-after-gameplay.png'),
      rejectedAllDisplayTest: '/tmp/ballpoint-breach-font-all-display.png',
    },
    menuTypography,
    gameplayTypography,
    errors,
  }, null, 2));
} finally {
  await browser.close();
}
