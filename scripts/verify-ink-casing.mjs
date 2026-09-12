import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:8913/';
const output = process.env.QA_OUTPUT || '/tmp/ballpoint-breach-ink-casing.png';
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

  const url = new URL(baseUrl);
  url.searchParams.set('inkVersion', 'v5');
  url.searchParams.set('capture', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  const audit = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { EffectPool } = await import('/src/effects/EffectPool.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1280, 720);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xeee9dd);
    renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:200;width:100%;height:100%';
    document.body.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1280 / 720, 0.01, 30);
    camera.position.set(0, 0.2, 4.4);
    camera.lookAt(0, 0.05, 0);
    camera.layers.enable(1);
    const pool = new EffectPool(scene, 8, 0, 0, 0, 8, 4, 0);
    pool.spawnFirearmAftermath(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      'rifle',
      7,
    );

    const visibleCasings = pool.root.children.filter(child => child.name.startsWith('ejected-casing-') && child.visible);
    const spent = visibleCasings.find(child => child.getObjectByName('spent-cartridge')?.visible);
    if (!spent) throw new Error('The rifle did not expose a visible spent cartridge');
    for (const candidate of visibleCasings) candidate.visible = candidate === spent;
    spent.position.set(0, 0, 0);
    spent.scale.multiplyScalar(7.5);
    spent.rotation.set(0.72, -0.36, -0.62);

    const requiredParts = [
      'case-body',
      'case-shoulder',
      'case-neck',
      'case-base-rim',
      'case-primer',
      'case-mouth-ring',
      'case-ink-wash-band',
      'case-ink-splatter',
    ];
    const presentParts = requiredParts.filter(name => Boolean(spent.getObjectByName(name)));
    renderer.render(scene, camera);
    return { visibleCasingCount: visibleCasings.length, requiredParts, presentParts };
  });

  assert.equal(audit.visibleCasingCount, 3);
  assert.deepEqual(audit.presentParts, audit.requiredParts);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: output });
  console.log(JSON.stringify({ output, ...audit, errors }));
} finally {
  await browser.close();
}
