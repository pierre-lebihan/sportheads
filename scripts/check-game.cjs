// Functional smoke test of the actual WASM match through its public browser UI.
const assert=require('node:assert/strict');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1024}});const errors=[];
    await page.addInitScript(()=>{const OriginalAudio=window.Audio;window.playedAudio=[];window.Audio=class extends OriginalAudio{constructor(...args){super(...args);window.playedAudio.push(this);}};});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>errors.push(r.url()));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    const url=process.argv[2];assert.ok(url,'Usage: node scripts/check-game.cjs URL');
    assert.equal((await page.goto(url)).status(),200);
    await page.waitForFunction(()=>window.ready||window.loadError);
    assert.equal(await page.evaluate(()=>window.loadError),undefined);
    assert.equal(await page.locator('#play-local').isVisible(),true);
    assert.equal(await page.locator('#start').isVisible(),false);
    await goToSetup(page, 'rules');
    assert.equal(await page.locator('#start').isEnabled(),true);
    assert.equal(await page.locator('#target-score').inputValue(),'7');
    assert.equal(await page.locator('#clock').count(),0);
    await page.evaluate(() => { const input = document.querySelector('#target-score'); input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); }); assert.equal(await page.locator('#start').isEnabled(),false);
    await setTarget(page, 3);
    await page.click('#start');
    await page.evaluate(()=>{for(let i=0;i<89;i++)sportheads.engine.game_tick(0);sportheads.render();});
    assert.equal(await page.evaluate(()=>sportheads.snapshot().phase),1);
    const positions=()=>page.evaluate(()=>{const e=sportheads.engine;return Array.from({length:e.game_body_count()},(_,i)=>({role:e.game_body_value(i,9),x:e.game_body_value(i,0),y:e.game_body_value(i,1),angle:e.game_body_value(i,4)}));});
    const before=await positions();
    await page.keyboard.down('KeyD');await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('KeyW');await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');await page.keyboard.down('KeyP');
    await page.waitForFunction(()=>sportheads.snapshot().tick>=94);
    const after=await positions();
    for(const key of ['KeyD','ArrowLeft','KeyW','ArrowUp','Space','KeyP'])await page.keyboard.up(key);
    for(const role of [1,2]){
      const a=before.find(b=>b.role===role),b=after.find(b=>b.role===role);
      assert.ok(role===1?b.x>a.x:b.x<a.x,'both players move');
      assert.ok(b.y<a.y-10,'both players jump');
    }
    for(const role of [4,5])assert.ok(Math.abs(after.find(b=>b.role===role).angle-before.find(b=>b.role===role).angle)>.1,'both feet swing');
    await page.screenshot({path:'evidence/local-match.png',fullPage:true});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#paused').isVisible(),true);
    const pausedTick=await page.evaluate(()=>sportheads.snapshot().tick);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>sportheads.snapshot().tick),pausedTick);
    await page.click('#resume');
    assert.equal(await page.evaluate(()=>sportheads.snapshot().paused),false);
    // Drive a real scoring transition; the same setup is used by the Flash oracle.
    const goal=await page.evaluate(()=>{const e=sportheads.engine;e.game_probe_start(40,400,0,0);e.game_tick(0);sportheads.render();return sportheads.snapshot();});
    assert.deepEqual(goal.score,[0,1]);assert.equal(goal.phase,2);
    assert.equal(await page.locator('#score-right').innerText(),'1');
    const reset=await page.evaluate(()=>{for(let i=0;i<15;i++)sportheads.engine.game_tick(0);sportheads.render();return sportheads.snapshot();});
    assert.equal(reset.phase,0);assert.deepEqual(reset.score,[0,1]);
    // Complete a real first-to-three match, including goals and countdowns.
    const final=await page.evaluate(()=>{const e=sportheads.engine;e.game_start_match(7,3,0);let steps=0;while(e.game_value(0)!==3&&steps<20000){e.game_tick(steps%120<60?2|16|8|128:4|64);steps++;}sportheads.render();return {...sportheads.snapshot(),steps,finite:Array.from({length:e.game_body_count()},(_,i)=>Number.isFinite(e.game_body_value(i,0))&&Number.isFinite(e.game_body_value(i,1))).every(Boolean)};});
    assert.equal(final.phase,3);assert.equal(final.targetScore,3);assert.equal(Math.max(...final.score),3);assert.ok(final.finite);assert.ok(final.steps<20000);
    assert.equal(await page.locator('#finished').isVisible(),true);
    await page.click('#again');
    const fresh=await page.evaluate(()=>sportheads.snapshot());assert.deepEqual(fresh.score,[0,0]);assert.equal(fresh.phase,0);
    // Only local/remote multiplayer are exposed; the chosen target survives replay.
    assert.equal(await page.locator('#skin-left option').count(),12);
    assert.equal(await page.locator('#mode,#goals').count(),0);
    assert.equal(await page.locator('.play-modes button').count(),2);
    assert.deepEqual(await page.evaluate(()=>[sportheads.engine.game_value(12),sportheads.engine.game_value(14)]),[1,3]);
    assert.equal(await page.locator('#target-score').inputValue(),'3');
    for(let kind=1;kind<=18;kind++){
      const state=await page.evaluate(kind=>{const e=sportheads.engine;e.game_start(4,0,0,true);for(let i=0;i<89;i++)e.game_tick(0);e.game_collect(kind,kind%2);for(let i=0;i<3;i++)e.game_tick(0);sportheads.render();return sportheads.renderState();},kind);
      assert.ok(state.players.every(p=>Number.isFinite(p.scale)));
    }
    await page.evaluate(()=>{const e=sportheads.engine;e.game_start(4,0,0,true);for(let i=0;i<89+201;i++)e.game_tick(0);sportheads.render();});
    assert.ok(await page.evaluate(()=>sportheads.renderState().powerups.length>0));
    await page.screenshot({path:'evidence/local-match-bonus.png',fullPage:true});
    // A real scoring frame must play decoded audio, and mute must stop the cheer too.
    await page.evaluate(()=>sportheads.engine.game_probe_start(40,400,0,0));
    await page.waitForFunction(()=>sportheads.snapshot().phase===2);
    await page.waitForFunction(()=>window.playedAudio.some(a=>!a.loop&&!a.paused&&a.readyState>=2));
    await page.click('#sound');
    assert.ok(await page.evaluate(()=>window.playedAudio.every(a=>a.paused)),'mute stops music and active effects');
    await page.click('#sound');
    // Leaving the page must clear pressed keys and pause its clock.
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(()=>sportheads.snapshot().paused),true);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'evidence/local-match-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,url,checks:['two-player movement/jump/kick','pause/resume','goal/score/reset','first-to-target victory/replay','blur pause','mobile layout','local/remote selection','18 bonus renderings','automatic pickup spawn','decoded audio/mute'],completeMatchSteps:final.steps,score:final.score}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
