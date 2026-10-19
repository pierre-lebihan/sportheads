// Local functional checks. Public signalling is exercised by check-setup/rejoin.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-bonus-pitches.cjs URL');
(async () => {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch(type === chromium ? {channel:'chrome',headless:true,args:['--no-proxy-server']} : {headless:true});
    try {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const errors=[]; page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url); await page.waitForFunction(()=>window.ready || window.loadError);
      assert.equal(await page.evaluate(()=>window.loadError),undefined);
      await page.click('#play-local'); await goToSetup(page,'pitch');
      assert.equal(await page.isChecked('#bonus-pitches'),false);
      assert.equal(await page.locator('#pitch option').count(),14);
      // With the option off, repeated random choices remain within the base set.
      await page.evaluate(()=>{
        for(let i=0;i<40;i++) {
          document.querySelector('#random-pitch').click();
          if(sportheads.snapshot().pitch>=21) throw Error('Bonus pitch exposed while disabled');
        }
      });
      await page.check('#bonus-pitches'); assert.equal(await page.locator('#pitch option').count(),18);
      assert.equal(await page.locator('#pitch option[value="22"],#pitch option[value="23"]').count(),0);
      await page.evaluate(()=>{
        for(let i=0;i<40;i++) {
          document.querySelector('#random-pitch').click();
          if([22,23].includes(sportheads.snapshot().pitch)) throw Error('Removed pitch returned by random selection');
        }
      });
      const hashes=[];
      for(const [id,name] of [[21,'Flipper'],[24,'Ricochets'],[25,'Plafond bas'],[26,'Le diamant']]) {
        await page.selectOption('#pitch',String(id));
        assert.equal(await page.locator('#pitch-caption').innerText(),name);
        assert.ok((await page.locator('#pitch-detail').innerText()).length>20);
        hashes.push(await page.locator('#pitch-preview').evaluate(canvas=>canvas.toDataURL()));
        await page.screenshot({path:`evidence/bonus-pitch-${type.name()}-${id}.png`});
        await goToSetup(page,'rules'); await page.selectOption('#bonuses','0'); await page.click('#start');
        assert.equal(await page.evaluate(()=>sportheads.engine.game_value(15)),id);
        // Settings cannot remove the layout in the middle of a match.
        await page.click('#play-view'); assert.equal(await page.isEnabled('#bonus-pitches'),false);
        await page.click('#quit-match-settings'); await page.click('#play-local'); await goToSetup(page,'pitch');
        assert.equal(await page.isChecked('#bonus-pitches'),true);
        assert.equal(await page.locator('#pitch').inputValue(),String(id));
      }
      assert.equal(new Set(hashes).size,4,'four distinct previews');
      await page.selectOption('#pitch','8');
      // Force the random index only during the click, proving that bonus layouts
      // participate without relying on a probabilistic sampling assertion.
      await page.evaluate(()=>{
        const select=document.querySelector('#pitch');
        const choices=[...select.options].filter(option=>option.value!==select.value);
        const random=Math.random; Math.random=()=> (choices.findIndex(option=>option.value==='21')+.5)/choices.length;
        try { document.querySelector('#random-pitch').click(); } finally { Math.random=random; }
      });
      assert.equal(await page.locator('#pitch').inputValue(),'21');
      await page.uncheck('#bonus-pitches');
      assert.equal(await page.locator('#pitch').inputValue(),'8'); assert.equal(await page.locator('#pitch option').count(),14);
      assert.equal(await page.locator('#pitch-detail').isVisible(),false);
      // AI preparation shares the same opt-in; start with a real planner Worker.
      await page.click('#setup-back'); await page.click('#setup-back'); await page.click('#play-ai');
      await page.click('#setup-next'); await goToSetup(page,'pitch'); await page.check('#bonus-pitches');
      await page.selectOption('#pitch','25'); await goToSetup(page,'rules'); await page.click('#start');
      await page.waitForFunction(()=>sportheads.snapshot().phase===1);
      assert.equal(await page.evaluate(()=>sportheads.snapshot().pitch),25);
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({passed:true,browser:type.name(),bonusPitches:4,removedPitches:[22,23],defaultOff:true,randomOptIn:true,localMatches:4,aiMatch:true}));
    } finally {await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
