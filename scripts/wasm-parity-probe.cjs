const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const replay=JSON.parse(fs.readFileSync('evidence/replay.json')).runs[0].states;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    // No Ruffle needed here: execute the independently compiled Rust WASM module.
    await page.goto('http://127.0.0.1:8765/evidence/original.json');
    const rust=await page.evaluate(async()=>{
      const {instance}=await WebAssembly.instantiateStreaming(fetch('/probe/physics-spike.wasm'));
      const e=instance.exports;
      return Array.from({length:181},(_,ticks)=>({
        x:e.ball_x(400,300,75,-100,ticks),
        y:e.ball_y(400,300,75,-100,ticks),
        vy:e.ball_vy(400,300,75,-100,ticks),
      }));
    });
    const comparisons=rust.map((expected,tick)=>{
      const actual=replay[tick].bodies.find(b=>b.name==='ball');
      const error=Math.max(...['x','y','vy'].map(k=>Math.abs(actual[k]-expected[k])));
      return {tick,expected,actual:{x:actual.x,y:actual.y,vy:actual.vy},maxAbsoluteError:error};
    });
    const firstDivergence=comparisons.find(c=>c.maxAbsoluteError!==0);
    // Assert only the measured collision-free window, not the full game trajectory.
    for (const c of comparisons.slice(0,21)) assert.equal(c.maxAbsoluteError,0,`tick ${c.tick}`);
    assert.ok(firstDivergence,'the ballistic-only spike must eventually diverge from colliding gameplay');
    const report={passed:true,scope:'collision-free ball integration only; no collision solver',exactTicks:comparisons.slice(1,firstDivergence.tick).length,firstDivergence,comparisons};
    fs.writeFileSync('evidence/wasm-parity.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,exactTicks:report.exactTicks,firstDivergenceTick:firstDivergence.tick,scope:report.scope}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
