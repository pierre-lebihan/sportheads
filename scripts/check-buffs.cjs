const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setBalance, setManualBuffs, setTarget } = require('./setup-browser.cjs');
// Friends' caricatures are only listed with a group link.
const url = process.argv[2] && process.argv[2] + '?groupe=tout'; assert.ok(url, 'Usage: node scripts/check-buffs.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  try {
    for (const [browser,mobile] of [[chrome,false],[chrome,true],[safari,true]]) {
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1280,height:1100}, isMobile:mobile, hasTouch:mobile });
      const page = await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
      if (browser===chrome) { const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true}); }
      await page.goto(url);await page.waitForFunction(()=>window.ready||window.loadError);assert.equal(await page.evaluate(()=>window.loadError),undefined);
      await goToSetup(page,'players');await page.selectOption('#skin-left','13');await page.selectOption('#skin-right','23');await goToSetup(page,'rules');
      const buffs=()=>page.evaluate(()=>sportheads.snapshot().buffs);
      assert.deepEqual(await buffs(),[[0,0,0,0,0],[0,0,0,0,0]]);
      assert.equal(await page.locator('.balance-details').isVisible(),false);
      assert.equal(await page.locator('#balance-amount').isVisible(),false);
      await setBalance(page,'superman');assert.deepEqual(await buffs(),[[30,30,30,30,30],[30,30,30,30,30]]);
      assert.equal(await page.locator('#buff-jump').isEnabled(),false);
      assert.equal(await page.locator('.balance-details').isVisible(),false);
      assert.doesNotMatch(await page.locator('#balance-controls').innerText(), /%|Puissance de saut|Taille de la tête|Protection du but/);
      await setBalance(page,'manual');assert.deepEqual(await buffs(),[[30,30,30,30,30],[30,30,30,30,30]]);
      assert.equal(await page.locator('.balance-details').isVisible(),true);
      assert.equal(await page.locator('[data-buff-stat]:visible').count(),5);
      for (const preset of ['blue','red']) for (const amount of [10,30,50]) {
        await setBalance(page,preset,amount);
        assert.equal(await page.locator('.balance-details').isVisible(),false);
        assert.equal(await page.locator('#balance-amount').isVisible(),true);
        assert.equal(await page.locator('#balance-amount').getAttribute('aria-valuetext'), ['Un peu','Normal','Beaucoup'][[10,30,50].indexOf(amount)]);
        assert.doesNotMatch(await page.locator('#balance-controls').innerText(), /%|Puissance de saut|Taille de la tête|Protection du but/);
        assert.deepEqual(await buffs(),[0,1].map(side=>Array(5).fill(preset===(side===0?'blue':'red')?amount:0)));
      }
      await page.locator('#balance-amount').focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
      assert.deepEqual(await buffs(),[[0,0,0,0,0],[30,30,30,30,30]],'the aid slider snaps to its middle level');
      await setManualBuffs(page,[[1,50,49,37,11],[49,23,17,5,43]]);
      assert.deepEqual(await buffs(),[[1,50,49,37,11],[49,23,17,5,43]]);
      for (const [side,expected] of [[0,['1','50','49','37','11']],[1,['49','23','17','5','43']]]) {
        await page.locator(`[data-balance-side="${side}"]`).click();
        assert.deepEqual(await page.locator('[data-buff-stat]').evaluateAll(inputs=>inputs.map(input=>input.value)),expected);
      }
      assert.ok(await page.locator('[data-balance-side="0"]').innerText().then(text=>text.includes('Pierre')));
      assert.ok(await page.locator('[data-balance-side="1"]').innerText().then(text=>text.includes('Vilma')));
      await page.locator('[data-balance-side="0"]').click();
      await page.locator('#buff-jump').focus();await page.keyboard.press('ArrowRight');
      assert.equal((await buffs())[0][0],2,'manual percentages are precise, not ten-percent steps');
      await setTarget(page,1);await page.selectOption('#bonuses', '0');
      await goToSetup(page,'pitch');await goToSetup(page,'rules');assert.deepEqual(await buffs(),[[2,50,49,37,11],[49,23,17,5,43]]);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const name=browser===chrome?'chromium':'webkit';
      await page.screenshot({path:`evidence/buffs-${name}-${mobile?'mobile':'desktop'}.png`,fullPage:true});
      if(mobile){await page.setViewportSize({width:844,height:390});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#balance-controls').scrollIntoViewIfNeeded();await page.screenshot({path:`evidence/buffs-${name}-landscape.png`});await page.setViewportSize({width:390,height:844});}
      await page.click('#start');await page.waitForFunction(()=>sportheads.snapshot().phase===1);
      const actual=await page.evaluate(()=>{
        const e=sportheads.engine;
        return {buffs:[0,1].map(side=>[0,1,2,3,4].map(stat=>e.game_buff_value(side,stat))), legacy:[0,1].map(side=>e.game_player_value(side,6)), goals:[e.game_value(8),e.game_value(9)]};
      });
      assert.deepEqual(actual.buffs,[[2,50,49,37,11],[49,23,17,5,43]]);assert.deepEqual(actual.legacy,[0,0]);assert.deepEqual(actual.goals,[51,83]);
      const pickup = await page.evaluate(()=>{
        sportheads.engine.game_collect(7,1); sportheads.engine.game_collect(14,0); sportheads.render();
        return {height:sportheads.engine.game_value(8),frame:sportheads.renderState().goalFrames[0]};
      });
      assert.deepEqual(pickup,{height:71,frame:2},'arbitrary percentages preserve the big-goal drawing as well as its collision');
      await page.screenshot({path:`evidence/buffs-match-${name}-${mobile?'mobile':'desktop'}.png`});
      await page.click('#play-view');assert.equal(await page.locator('[data-balance-preset=normal]').isEnabled(),false);assert.equal(await page.locator('#buff-jump').isEnabled(),false);
      await page.locator('[data-balance-side="1"]').click();assert.equal(await page.locator('#buff-head').inputValue(),'23','locked settings can still inspect either camp');
      await page.click('#close-settings');await page.click('#resume');await page.click('#pause');await page.click('#restart');
      assert.deepEqual(await buffs(),[[2,50,49,37,11],[49,23,17,5,43]]);
      assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,browser:name,mobile,presets:5,manualPercentStep:1,independentStats:5}));
      await context.close();
    }
  } finally {await chrome.close();await safari.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
