import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5&capture=1&damage=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => Number(document.querySelector('#ink-damage-overlay')?.dataset.splashes) > 0);
  await page.screenshot({path:resolve('docs/screenshots/ink-study/ink-combat-hit.png')});
  // Isolate lifetime checks from fresh enemy hits in the running arena.
  await page.goto('http://127.0.0.1:8911/?inkVersion=v5', {waitUntil:'networkidle'});
  await page.evaluate(async () => {
    const { InkDamageOverlay } = await import('/src/ui/InkDamageOverlay.ts');
    document.querySelector('#ink-damage-overlay').remove();
    document.querySelector('#game-overlay').classList.remove('visible');
    document.querySelector('#game-overlay').style.display = 'none';
    document.body.dataset.gameMode = 'playing';
    window.testInk = new InkDamageOverlay(document);
    window.testInk.hit(0,18); window.testInk.update(4);
  });
  const remaining = await page.evaluate(() => {
    const canvas = document.querySelector('#ink-damage-overlay');
    return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i) => i % 4 === 3 && v > 0);
  });
  assert.equal(remaining, false, 'Ink must disappear completely after its lifetime');
  await page.evaluate(async () => {
    for (let i=0;i<20;i++) window.testInk.hit(i * .7,18);
    window.testInk.update(.15);
  });
  assert.equal(await page.locator('#ink-damage-overlay').getAttribute('data-splashes'),'6');
  const center = await page.evaluate(() => {
    const c = document.querySelector('#ink-damage-overlay');
    return c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3];
  });
  assert.equal(center,0,'Reticle center must remain clear under stacked hits');
  await page.screenshot({path:resolve('docs/screenshots/ink-study/ink-combat-stacked.png')});
  await page.setViewportSize({width:896,height:560});
  await page.evaluate(() => window.testInk.update(.1));
  await page.screenshot({path:resolve('docs/screenshots/ink-study/ink-combat-compact.png')});
  await page.evaluate(() => window.testInk.dispose());
  assert.equal(await page.locator('#ink-damage-overlay').count(),0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async () => {
    const { InkDamageOverlay } = await import('/src/ui/InkDamageOverlay.ts');
    window.testInk = new InkDamageOverlay(document);
    window.testInk.hit(1,18); window.testInk.update(.2);
  });
  assert.equal(await page.locator('#ink-damage-overlay').getAttribute('data-splashes'),'3');
  await page.evaluate(() => { window.testInk.clear(); window.testInk.dispose(); });

  // Audition the production projectile pool from an oblique camera.
  await page.setViewportSize({width:1000,height:650});
  await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { ProjectilePool } = await import('/src/enemies/ProjectilePool.ts');
    const renderer = new THREE.WebGLRenderer({alpha:false,antialias:true});
    renderer.setSize(1000,650); renderer.setClearColor(0xefeee7);
    const c = renderer.domElement; c.style.cssText='position:fixed;inset:0;z-index:200'; document.body.append(c);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40,1000/650,.01,20); camera.position.set(1.3,.7,2.2); camera.lookAt(0,0,0);
    const pool = new ProjectilePool(2); scene.add(pool.object);
    pool.spawn({ownerId:'preview',ownerKind:'grunt',origin:new THREE.Vector3(),direction:new THREE.Vector3(1,.05,.2),speed:8,damage:8});
    renderer.render(scene,camera);
    window.projectilePreview = renderer;
  });
  await page.screenshot({path:resolve('docs/screenshots/ink-study/ink-combat-projectile.png')});
  await page.goto('http://127.0.0.1:8911/?style=ballpoint', {waitUntil:'networkidle'});
  assert.equal(await page.locator('#ink-damage-overlay').count(),0,'Legacy style must not mount ink feedback');
  const legacySprites = await page.evaluate(async () => {
    const { ProjectilePool } = await import('/src/enemies/ProjectilePool.ts');
    return new ProjectilePool(1).object.children[0].children.filter(child => child.isSprite).length;
  });
  assert.equal(legacySprites,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: real damage event, fade, bounded stacking, clear reticle, resize, reduced motion, disposal, projectile preview; no page/network errors.');
} finally { await browser.close(); }
