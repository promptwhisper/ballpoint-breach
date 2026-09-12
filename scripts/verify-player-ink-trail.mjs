import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8913/';
const output = process.env.QA_OUTPUT || '/tmp/ballpoint-breach-player-ink-trail.png';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });

  const gameUrl = new URL(baseUrl);
  gameUrl.searchParams.set('inkVersion', 'v5');
  gameUrl.searchParams.set('capture', '1');
  gameUrl.searchParams.set('fire', '1');
  await page.goto(gameUrl.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__SCRIBBLE_SIEGE__?.snapshot().effects.shotTrails > 0, null, {
    polling: 'raf',
    timeout: 5000,
  });
  const live = await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().effects);
  assert.equal(live.shotTrails, 1);
  await page.waitForTimeout(240);
  assert.equal(await page.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().effects.shotTrails), 0);

  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { EffectPool } = await import('/src/effects/EffectPool.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1280, 720);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xefeee7);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:fixed;inset:0;z-index:200;width:100%;height:100%';
    document.body.append(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1280 / 720, 0.01, 40);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    const pool = new EffectPool(scene, 8, 0, 0, 0, 0, 0, 4);
    const start = new THREE.Vector3(-0.8, -0.15, 0);
    const end = new THREE.Vector3(3, 0.32, 0);
    pool.spawnPlayerInkTrail(start, end, camera.position, new THREE.Vector3(0, 1, 0), 'rifle', 17);
    pool.spawnBurst(end, 'blue', 0.16, 0.2);
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: output });

  const ballpointPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const ballpointUrl = new URL(baseUrl);
  ballpointUrl.searchParams.set('style', 'ballpoint');
  ballpointUrl.searchParams.set('capture', '1');
  ballpointUrl.searchParams.set('fire', '1');
  await ballpointPage.goto(ballpointUrl.href, { waitUntil: 'domcontentloaded' });
  await ballpointPage.waitForTimeout(900);
  assert.equal(await ballpointPage.evaluate(() => window.__SCRIBBLE_SIEGE__.snapshot().effects.shotTrails), 0);
  await ballpointPage.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ output, liveShotTrails: live.shotTrails, expired: true, ballpointTrails: 0, errors }));
} finally {
  await browser.close();
}
