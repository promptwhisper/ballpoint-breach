import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const shots = process.env.LEVEL_SCREENSHOTS || '../level-redesign-review';
mkdirSync(shots,{recursive:true});
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--enable-unsafe-swiftshader'],
});
try {
  for(const [width,height] of [[1280,720],[956,430],[430,956]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:true});
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8912/?mode=fold-foundry');
    await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__?.snapshot());
    assert.equal(await page.locator('#overlay-title').textContent(),'选一页，开战');
    const documentToken=await page.evaluate(()=>window.__documentToken=Math.random());
    await page.screenshot({path:shots+'/menu-'+width+'.png'});
    for(const [mode,button] of [['fold-foundry','#fold-mode-button'],['dual-pages','#pages-mode-button'],['classic','#start-button']]) {
      const startAt=Date.now();
      await page.locator(button).tap();
      await page.waitForFunction(mode=>window.__SCRIBBLE_SIEGE__.snapshot().mode==='playing'
        && window.__SCRIBBLE_SIEGE__.snapshot().level===mode,mode);
      assert.equal(await page.evaluate(()=>window.__documentToken),documentToken,'selection must not navigate/reload');
      assert.equal(await page.locator('#level-choices').isVisible(),false);
      await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__.snapshot().enemies>=2);
      await page.screenshot({path:shots+'/'+mode+'-'+width+'.png'});
      const initial=await page.evaluate(()=>window.__SCRIBBLE_SIEGE__.snapshot());
      if(width===1280) {
        await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
        const after=await page.evaluate(()=>window.__SCRIBBLE_SIEGE__.snapshot());
        assert.ok(Math.hypot(after.position[0]-initial.position[0],after.position[2]-initial.position[2])>2,'player can leave the spawn');
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__.snapshot().mode==='paused');
      assert.equal(await page.locator('#level-choices').isVisible(),false,'selection only exists on start page');
      await page.locator('#return-menu-button').tap();
      assert.equal(await page.locator('#level-choices').isVisible(),true);
      console.log(JSON.stringify({width,height,mode,singleClick:true,sameDocument:true,firstEnemies:initial.enemies,elapsedMs:Date.now()-startAt}));
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  // Accelerated combat checks the complete director/boss/victory/reset integration.
  for (const mode of ['fold-foundry','dual-pages']) {
    const page=await browser.newPage({viewport:{width:956,height:430}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8912/?mode='+mode+'&autoplay=1&capture=1');
    await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__?.snapshot().mode==='victory',null,{timeout:45000});
    const result=await page.evaluate(()=>window.__SCRIBBLE_SIEGE__.snapshot());
    assert.equal(result.wave,6);assert.equal(result.enemies,0);
    assert.equal(await page.locator('#level-choices').isVisible(),false);
    await page.locator('#restart-button').click();
    await page.waitForFunction(()=>window.__SCRIBBLE_SIEGE__.snapshot().mode==='playing');
    assert.equal((await page.evaluate(()=>window.__SCRIBBLE_SIEGE__.snapshot())).wave,1);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mode,allSixEncounters:true,victory:true,restart:true,errors}));
    await page.close();
  }
} finally {await browser.close();}
