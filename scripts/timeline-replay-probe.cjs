const fs=require('node:fs');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Unlike replay-probe, real Flash timelines and deferred callbacks advance here.
// The seeded variant replaces 12 Math.random() calls in MainTimeline with an LCG.
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const runs=[];
  const errors=[];
  try{
    for(let run=0;run<3;run++){
      const context=await browser.newContext();
      const page=await context.newPage();
      page.on('console',m=>{if(/ERROR/.test(m.text()))errors.push({run,text:m.text()});});
      await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
      await page.goto('http://127.0.0.1:8765/probe/?file=seeded');
      await page.waitForFunction(()=>window.loaded&&typeof window.player?.probeState==='function',{timeout:30000});
      const call=(name,...args)=>page.evaluate(({name,args})=>window.player.ruffle().callExternalInterface(name,...args),{name,args});
      await call('probeCall','gotoAndPlay',[3]);
      await page.waitForTimeout(200);
      await call('probeCall','gotoAndStop',['menu']);
      await call('probeSet','tpPitch',2);
      await call('probeCall','new2PlayerGame',[]);
      await page.waitForTimeout(200);
      await page.evaluate(()=>window.player.ruffle().suspend());
      await call('probeCall','initLevel',[]);
      await page.evaluate(()=>window.player.ruffle().resume());
      await page.waitForTimeout(200);
      await page.evaluate(()=>window.player.ruffle().suspend());
      await call('probeSeed',123456);
      await call('probeBodySet','ball',400,300,75,-100,0,0);
      await call('probeCall','Counter.gotoAndStop',[1]);
      await call('probeSetPath','Counter.y',-1000);
      await call('probeSetPath','briefer.y',1000);
      for(const [k,v]of Object.entries({timer:0,PUTimer:0,pauseGame:false,timeLeft:60,timeLeftBitch:0,xspeed:0,oppxspeed:0,inGoal:false}))await call('probeSet',k,v);
      // Keep characters on their halves, leaving the ball and bonus logic active.
      const schedule=Array.from({length:300},(_,tick)=>{
        const keys=[];
        if(tick%90<15)keys.push(38,87);
        if(tick%45<10)keys.push(80,32);
        return keys;
      });
      await call('probeReplayStart',schedule);
      await page.evaluate(()=>window.player.ruffle().resume());
      await page.waitForFunction(()=>window.player.ruffle().callExternalInterface('probeReplayResult').complete,{timeout:20000});
      await page.evaluate(()=>window.player.ruffle().suspend());
      const result=await call('probeReplayResult');
      const traces=await page.evaluate(()=>window.traces);
      const hash=crypto.createHash('sha256').update(JSON.stringify(result.states)).digest('hex');
      runs.push({run,hash,states:result.states,traces});
      console.log('timeline-replay',run,hash,'frames',result.states.length,'maxGameplayTimer',Math.max(...result.states.map(s=>s.timer)));
      await context.close();
    }
    const report={scope:'300 real ENTER_FRAME broadcasts per run, seeded MainTimeline RNG, original Box2D; three fresh browser contexts',runs,errors};
    fs.writeFileSync('evidence/timeline-replay.json',JSON.stringify(report,null,2));
    assert.deepEqual(errors.filter(e=>!e.text.includes('pb_Preloader_2')),[], 'unexpected AVM2 error');
    for(let n=1;n<runs.length;n++){
      const tick=runs[0].states.findIndex((s,i)=>JSON.stringify(s)!==JSON.stringify(runs[n].states[i]));
      if(tick>=0)console.log('first divergence',n,tick,JSON.stringify({a:runs[0].states[tick],b:runs[n].states[tick]}));
    }
    assert.equal(runs[0].hash,runs[1].hash);
    assert.equal(runs[0].hash,runs[2].hash);
    assert.equal(runs[0].states.length,300);
    console.log('PASS: three full-timeline replays identical');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
