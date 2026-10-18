const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-quit.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const errors = [], pages = [];
  const state = page => page.evaluate(() => sportheads.snapshot());
  async function pageAt(browser, target = url) {
    const context = await browser.newContext({ viewport: {width:390,height:844}, isMobile:true, hasTouch:true });
    const page = await context.newPage(); pages.push(page); page.on('pageerror',e=>errors.push(e.message));
    if(browser===chrome){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});}
    await page.goto(target);await page.waitForFunction(()=>window.ready||window.loadError);
    assert.equal(await page.evaluate(()=>window.loadError),undefined);return page;
  }
  async function prepare(page) {
    await goToSetup(page,'rules');await setTarget(page,1);await page.uncheck('#bonuses');
    await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.click('#start');
    await page.waitForFunction(()=>sportheads.snapshot().phase===1);
  }
  async function home(page) {
    const s=await state(page);
    assert.equal(s.setupStep,'home');assert.equal(s.started,false);assert.equal(s.paused,false);assert.equal(s.connected,false);assert.equal(s.role,null);
    assert.equal(await page.locator('#quit-match-settings').isVisible(),false);
    assert.equal(await page.locator('#touch-controls').isVisible(),false);
    assert.equal(await page.locator('#play-local').isVisible(),true);
    assert.equal(await page.evaluate(()=>new URL(location.href).searchParams.has('room')),false);
    const tick=s.tick;await page.waitForTimeout(150);assert.equal((await state(page)).tick,tick,'quitting stops the simulation and the AI');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  try {
    for (const browser of [chrome,safari]) {
      const page=await pageAt(browser), name=browser===chrome?'chromium':'webkit';
      assert.equal(await page.locator('[data-quit-match]:visible').count(),0);
      await page.click('#play-local');await prepare(page);
      await page.keyboard.down('KeyD');await page.click('#pause');
      await page.screenshot({path:`evidence/quit-pause-${name}.png`});
      await page.locator('#paused [data-quit-match]').click();await home(page);await page.keyboard.up('KeyD');
      await page.click('#play-ai');await page.locator('[name=ai-level][value=expert]').check();await page.click('#setup-next');await prepare(page);
      await page.click('#play-view');await page.screenshot({path:`evidence/quit-settings-${name}.png`});
      await page.click('#quit-match-settings');await home(page);
      await page.click('#play-local');await prepare(page);
      await page.evaluate(()=>{
        const e=sportheads.engine;let ticks=0;
        while(e.game_value(0)!==3&&ticks++<40000)e.game_tick(ticks%120<60?2|16|8|128:4|64);
        if(e.game_value(0)!==3)throw Error('Match did not finish');sportheads.render();
      });
      await page.locator('#finished [data-quit-match]').click();await home(page);
      console.log(JSON.stringify({passed:true,browser:name,quitFrom:['pause','settings','finished'],aiStopped:true,mobile:true}));
      await page.context().close();
    }
    const host=await pageAt(chrome), guest=await pageAt(chrome);
    for(const quitting of ['host','guest']){
      await host.click('#play-online');await host.click('#create-room');
      await host.waitForFunction(()=>!document.querySelector('#room-details').hidden
        && document.querySelector('#room-code').textContent===sportheads.snapshot().code
        && /^[A-HJ-NP-Z2-9]{8}$/.test(sportheads.snapshot().code));
      const code=await host.locator('#room-code').innerText(), share=new URL(url);share.searchParams.set('room',code);
      await guest.goto(share.href);await guest.waitForFunction(()=>window.ready||window.loadError);await guest.click('#join-room');
      await Promise.all([host,guest].map(p=>p.waitForFunction(()=>sportheads.snapshot().connected)));
      await prepare(host);await guest.waitForFunction(()=>sportheads.snapshot().phase===1);
      const quitter=quitting==='host'?host:guest, survivor=quitter===host?guest:host;
      await quitter.click('#pause');await quitter.locator('#paused [data-quit-match]').click();await home(quitter);
      await survivor.waitForFunction(()=>!sportheads.snapshot().connected);
      assert.equal((await state(survivor)).paused,true);
      assert.equal((await state(survivor)).code,code,'the survivor retains the recoverable room');
      assert.equal(await survivor.locator('#quit-match-settings').isVisible(),true);
      await survivor.click('#quit-match-settings');await home(survivor);
      console.log(JSON.stringify({passed:true,online:true,quitting,otherPlayerPaused:true,roomReleased:true}));
    }
    assert.deepEqual(errors,[]);
  } catch(error) {
    for(const page of pages)if(!page.isClosed())console.error(await state(page).catch(()=>null));
    throw error;
  } finally {await chrome.close();await safari.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
