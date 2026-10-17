const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Gameplay-loop tests only: timeline animation and delayed ENTER_FRAME callbacks
// do not advance while Ruffle is suspended. Automatic random powerups are disabled.
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const runs = [];
  const errors = [];
  const checks = [];
  try {
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('console', m => { if (/ERROR/.test(m.text())) errors.push({run, text:m.text()}); });
      await page.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:8765/probe/?file='+(process.argv[2]||'instrumented'));
      await page.waitForFunction(() => window.loaded && typeof window.player?.probeState === 'function', {timeout:30000});
      const call = (name, ...args) => page.evaluate(({name,args}) => window.player.ruffle().callExternalInterface(name,...args), {name,args});
      await call('probeCall','gotoAndPlay',[3]);
      await page.waitForTimeout(200);
      await call('probeCall','gotoAndStop',['menu']);
      await call('probeSet','tpPitch',2);
      await call('probeCall','new2PlayerGame',[]);
      await page.waitForTimeout(200);
      await page.evaluate(() => window.player.ruffle().suspend());
      await call('probeCall','initLevel',[]);
      // Let Flash construct the blueprint's display objects and dispatch RENDER.
      // Calling onRender synchronously here sees unconstructed children.
      await page.evaluate(() => window.player.ruffle().resume());
      await page.waitForTimeout(200);
      await page.evaluate(() => window.player.ruffle().suspend());
      await call('probeCall','Counter.gotoAndStop',[1]);
      await call('probeBodySet','ball',400,300,75,-100,0,0);
      // PUTimer is uint in the SWF: a negative value would wrap and spawn a bonus.
      // Starting at 0 keeps its first automatic spawn (tick 201) outside this test.
      for (const [k,v] of Object.entries({timer:0,PUTimer:0,pauseGame:false,timeLeft:60,timeLeftBitch:0,xspeed:0,oppxspeed:0,inGoal:false})) await call('probeSet',k,v);
      const states = [await call('probeState')];
      for (let tick=0; tick<180; tick++) {
        const keys=[];
        if (tick>=15 && tick<45) keys.push(37);
        if (tick===25) keys.push(38);
        if (tick>=35 && tick<42) keys.push(80);
        if (tick>=70 && tick<100) keys.push(39);
        if (tick>=90 && tick<120) keys.push(68);
        if (tick===105) keys.push(87);
        if (tick>=110 && tick<118) keys.push(32);
        states.push(await call('probeStep',keys,1));
      }
      const hash=crypto.createHash('sha256').update(JSON.stringify(states)).digest('hex');
      runs.push({run,hash,states});
      console.log('replay',run,hash, 'timer',states.at(-1).timer);
      assert.equal(states.at(-1).timer,180);
      assert.equal(states.at(-1).timeLeft,54);
      assert.equal(states[26].bodies.find(b=>b.name==='hero').vy<0,true,'jump must rise');
      if (run===0) {
        await call('probeBodySet','ball',30,420,0,0,0,0);
        await call('probeCall','UpdateB2DBodyList',[]);
        await call('probeSet','inGoal',false);
        const before=await call('probeState');
        await call('probeCall','checkWinPoint',[]);
        const after=await call('probeState');
        assert.equal(after.scoreRight,before.scoreRight+1);
        await call('probeCall','checkWinPoint',[]);
        assert.equal((await call('probeState')).scoreRight,after.scoreRight,'one score per goal');
        checks.push({name:'left-goal-and-no-double-count',passed:true,before,after});
      }
      await context.close();
    }
    const output=process.argv[2]==='seeded'?'evidence/replay-seeded-validation.json':'evidence/replay.json';
    fs.writeFileSync(output,JSON.stringify({runs,checks,errors},null,2));
    assert.deepEqual(errors.filter(e=>!e.text.includes('pb_Preloader_2')),[], 'unexpected AVM2 error');
    for (let n=1;n<runs.length;n++) {
      const tick=runs[0].states.findIndex((s,i)=>JSON.stringify(s)!==JSON.stringify(runs[n].states[i]));
      if(tick>=0) console.log('first divergence',n,tick,JSON.stringify({a:runs[0].states[tick],b:runs[n].states[tick]}));
    }
    assert.equal(runs[0].hash,runs[1].hash);
    assert.equal(runs[0].hash,runs[2].hash);
    checks.push({name:'three-independent-replays-identical',passed:true,ticks:180});
    fs.writeFileSync(output,JSON.stringify({runs,checks,errors},null,2));
    console.log('PASS',checks.map(c=>c.name).join(', '));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
