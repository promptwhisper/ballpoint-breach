import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
mkdirSync('docs/screenshots/settings', {recursive:true});
try {
  for (const [width,height] of [[956,430],[430,956]]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:true});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8912/');
    assert.equal(await page.locator('[data-touch-action="grapple"], .grapple-meter').count(),0);
    const mode = () => page.evaluate(()=>window.__SCRIBBLE_SIEGE__.snapshot().mode);
    const ammo = async () => Number(await page.locator('[data-hud="ammo"]').textContent());
    await page.locator('#start-button').tap();
    await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__.snapshot().mode==='playing');
    const point=width>height?{x:600,y:180}:{x:210,y:600};
    const before=await ammo();
    await page.touchscreen.tap(point.x,point.y);
    await page.waitForTimeout(200);
    assert.ok(await ammo()<before,'default right-screen tap fires');
    await page.locator('#settings-toggle').tap();
    assert.equal(await mode(),'paused');
    const pausedAmmo=await ammo();
    assert.equal(await page.locator('#sensitivity-value').textContent(),'1.8 倍');
    const sliderBox=await page.locator('#look-sensitivity').boundingBox();
    const touchSession=await context.newCDPSession(page);
    const trackPoint=fraction=>width>height
      ? {x:sliderBox.x+12+fraction*(sliderBox.width-24),y:sliderBox.y+sliderBox.height/2,id:7}
      : {x:sliderBox.x+sliderBox.width/2,y:sliderBox.y+12+fraction*(sliderBox.height-24),id:7};
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[trackPoint(0)]});
    assert.equal(await page.locator('#sensitivity-value').textContent(),'0.5 倍');
    for (const fraction of [.2,.5,.8,1]) {
      await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[trackPoint(fraction)]});
      assert.equal(await page.locator('#sensitivity-value').textContent(),`${(Math.round((.5+fraction*3.5)*10)/10).toFixed(1)} 倍`);
    }
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[trackPoint(0)]});
    assert.equal(await page.locator('#sensitivity-value').textContent(),'0.5 倍');
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.locator('#look-sensitivity').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.locator('[value="button"]').tap();
    await page.locator('#sound-toggle').tap();
    assert.equal(await page.locator('#sound-toggle').textContent(),'已关闭');
    await page.waitForTimeout(150);
    assert.equal(await ammo(),pausedAmmo,'settings cannot fire');
    const bounds=await page.locator('.settings-card').boundingBox();
    assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height+1,JSON.stringify(bounds));
    await page.screenshot({path:`docs/screenshots/settings/panel-${width}.png`});
    await page.locator('#settings-close').tap();
    assert.equal(await mode(),'playing');
    assert.ok(await page.locator('.action-fire').isVisible());
    const unchanged=await ammo();
    await page.touchscreen.tap(point.x,point.y);
    await page.waitForTimeout(180);
    assert.equal(await ammo(),unchanged,'button mode disables screen shooting');
    await page.locator('.action-aim').tap();
    await page.locator('.action-fire').tap();
    await page.waitForTimeout(180);
    assert.ok(await ammo()<unchanged,'dedicated fire works while aimed');
    const cdp=await context.newCDPSession(page);
    const fire=await page.locator('.action-fire').boundingBox();
    const firePoint={x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:5};
    const heldBefore=await ammo();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[firePoint]});
    // A second finger can look without releasing the firing finger.
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[firePoint,{...point,id:6}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[firePoint,{x:point.x+15,y:point.y+15,id:6}]});
    await page.waitForTimeout(500);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await page.waitForTimeout(150);
    const released=await ammo();
    assert.ok(released<heldBefore-1,'hold fires repeatedly with second-finger look');
    await page.waitForTimeout(200);
    assert.equal(await ammo(),released,'cancel stops firing');
    await page.locator('.action-aim').tap();
    await page.screenshot({path:`docs/screenshots/settings/fire-${width}.png`});
    await page.reload();
    await page.locator('#settings-toggle').tap();
    assert.equal(await page.locator('#sensitivity-value').textContent(),'3.0 倍');
    assert.ok(await page.locator('[value="button"]').isChecked());
    assert.equal(await page.locator('#sound-toggle').textContent(),'已关闭');
    await page.locator('[value="screen"]').tap();
    await page.locator('#settings-close').tap();
    assert.equal(await mode(),'start','closing pre-game settings does not start a round');
    assert.ok(!await page.locator('.action-fire').isVisible());
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,height,settingsPersist:true,touchFire:true,pausedSafely:true,errors}));
    await context.close();
  }
} finally {await browser.close();}
