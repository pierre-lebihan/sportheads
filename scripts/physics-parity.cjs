const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const scenes=require('./physics-scenes.cjs');
const fields=['x','y','vx','vy','angle','omega','mass','inertia'];
const tolerance=1e-7;

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const cases=[];const errors=[];
  try{
    const page=await browser.newPage();
    page.on('console',m=>{if(/ERROR/.test(m.text()))errors.push(m.text());});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    await page.goto('http://127.0.0.1:8765/probe/?file=instrumented');
    await page.waitForFunction(()=>window.loaded&&typeof window.player?.physicsLoad==='function',{timeout:30000});
    await page.evaluate(async()=>{
      window.player.ruffle().suspend();
      const {instance}=await WebAssembly.instantiateStreaming(fetch('/probe/physics-core.wasm'));
      window.core=instance.exports;
      window.coreSnapshot=(n,j)=>({bodies:Array.from({length:n},(_,i)=>Object.fromEntries(
        [...['x','y','vx','vy','angle','omega','mass','inertia'].map((k,f)=>[k,window.core.core_body_value(i,f)]),
          ['sleeping',Boolean(window.core.core_sleeping(i))]])),
        joints:Array.from({length:j},(_,i)=>({angle:window.core.core_joint_angle(i),anchorError:window.core.core_joint_anchor_error(i)}))});
    });
    const call=(name,...args)=>page.evaluate(({name,args})=>window.player.ruffle().callExternalInterface(name,...args),{name,args});
    for(const fixture of scenes){
      const spec={continuous:false,sleep:false,...fixture};delete spec.motor;
      const flash=[await call('physicsLoad',spec)];
      const rust=[await page.evaluate(spec=>{
        const e=window.core;e.core_reset(...spec.gravity);e.core_settings(+spec.continuous,+spec.sleep);
        for(const b of spec.bodies){
          let index;
          if(b.type==='circle')index=e.core_circle(b.x,b.y,b.radius,b.density,b.friction,b.restitution,+b.fixed,b.vx,b.vy,b.omega);
          else if(b.type==='polygon'){
            for(const [x,y] of b.vertices)e.core_vertex(x,y);
            index=e.core_polygon(b.x,b.y,b.angle,b.density,b.friction,b.restitution,+b.fixed);
            e.core_velocity(index,b.vx,b.vy,b.omega);
          }else index=e.core_box(b.x,b.y,b.hx,b.hy,b.angle,b.density,b.friction,b.restitution,+b.fixed,b.vx,b.vy,b.omega);
          e.core_body_flags(index,b.group||0,+Boolean(b.bullet),+(b.allow_sleep!==false));
        }
        for(const j of spec.joints)e.core_joint(j.a,j.b,j.x,j.y,j.torque);
        return window.coreSnapshot(spec.bodies.length,spec.joints.length);
      },spec)];
      for(let tick=0;tick<spec.ticks;tick++){
        if(spec.kickAt?.tick===tick){
          const kick=spec.kickAt;
          await call('physicsVelocity',kick.body,kick.vx,kick.vy,kick.omega||0);
          await page.evaluate(kick=>window.core.core_velocity(kick.body,kick.vx,kick.vy,kick.omega||0),kick);
        }
        const motors=spec.joints.map(()=>fixture.motor?fixture.motor(tick):null);
        flash.push(await call('physicsStep',motors));
        rust.push(await page.evaluate(({motors,n,j})=>{
          motors.forEach((speed,i)=>{if(speed!==null)window.core.core_motor(i,speed);});window.core.core_tick();return window.coreSnapshot(n,j);
        },{motors,n:spec.bodies.length,j:spec.joints.length}));
      }
      let maxError=0,firstMismatch=null;const maxima={};
      for(let tick=0;tick<flash.length;tick++)for(let joint=0;joint<spec.joints.length;joint++)for(const field of ['angle','anchorError']){
        const expected=flash[tick].joints[joint][field],actual=rust[tick].joints[joint][field],error=Math.abs(actual-expected);
        maxima['joint.'+field]=Math.max(maxima['joint.'+field]||0,error);maxError=Math.max(maxError,error);
        if((!Number.isFinite(error)||error>tolerance)&&!firstMismatch)firstMismatch={tick,joint,field,expected,actual,error};
      }
      const contacts=s=>[...s.contacts,...s.contactsDuringStep.flat()];
      const contactFrames=flash.filter(s=>contacts(s).length>0).length;
      const maxContactPoints=Math.max(...flash.flatMap(s=>contacts(s).map(c=>c.points)),0);
      const isolatedJoint=spec.joints.length>0&&spec.bodies.length===2;
      if(!isolatedJoint)assert.ok(contactFrames>0,`${spec.name} must actually exercise a collision`);
      if(spec.name==='box-floor-two-points')assert.equal(maxContactPoints,2);
      const activeMotor=fixture.motor&&Array.from({length:spec.ticks},(_,tick)=>fixture.motor(tick)).some(speed=>speed!==0);
      if(activeMotor)for(let j=0;j<spec.joints.length;j++)assert.ok(flash.some(s=>Math.abs(s.joints[j].angle)>0.01),'motor must actually rotate');
      for(let tick=0;tick<flash.length;tick++)for(let body=0;body<spec.bodies.length;body++)for(const field of fields){
        assert.ok(flash[tick]?.bodies?.[body],`Missing Flash state: ${spec.name}, tick ${tick}`);
        const expected=flash[tick].bodies[body][field];const actual=rust[tick].bodies[body][field];
        const error=Math.abs(actual-expected);
        maxima[field]=Math.max(maxima[field]||0,error);
        if(!Number.isFinite(error)||error>maxError)maxError=error;
        if((!Number.isFinite(error)||error>tolerance)&&!firstMismatch)firstMismatch={tick,body,field,expected,actual,error};
      }
      let sleepMismatch=null,sleepingFrames=0;
      if(spec.sleep){
        for(let tick=0;tick<flash.length;tick++)for(let body=0;body<spec.bodies.length;body++){
          const expected=flash[tick].bodies[body].sleeping,actual=rust[tick].bodies[body].sleeping;
          assert.equal(typeof expected,'boolean',`Missing Flash sleeping state: ${spec.name}, tick ${tick}`);
          assert.equal(typeof actual,'boolean',`Missing Rust sleeping state: ${spec.name}, tick ${tick}`);
          if(expected&&spec.bodies[body].density>0)sleepingFrames++;
          if(expected!==actual&&!sleepMismatch)sleepMismatch={tick,body,field:'sleeping',expected,actual};
        }
        assert.ok(sleepingFrames>0,`${spec.name} must actually exercise dynamic body sleep`);
        if(spec.kickAt){
          const kick=spec.kickAt;
          assert.ok(flash.slice(0,kick.tick+1).some(s=>s.bodies[kick.body].sleeping),`${spec.name} must sleep before being kicked`);
          assert.equal(flash[kick.tick+1].bodies[kick.body].sleeping,false,`${spec.name} must actually wake after the kick`);
        }
      }
      const result={name:spec.name,passed:firstMismatch===null&&sleepMismatch===null,maxError,maxima,firstMismatch,sleepMismatch,sleepingFrames,contactFrames,maxContactPoints,spec,flash,rust};
      cases.push(result);
      console.log(JSON.stringify({name:result.name,passed:result.passed,maxima,firstMismatch,sleepMismatch,sleepingFrames}));
    }
    const unexpectedErrors=errors.filter(e=>!e.includes('pb_Preloader_2'));
    const report={scope:'discrete contacts, convex polygons, continuous collision detection and island sleeping; fixture flags matched in both engines',tolerance,cases,errors,unexpectedErrors};
    const passed=unexpectedErrors.length===0&&cases.every(c=>c.passed);
    const reportPath=passed?'evidence/physics-parity.json':'evidence/physics-parity-failed.json';
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
    assert.deepEqual(unexpectedErrors,[],'Unexpected Flash runtime error');
    assert.ok(cases.every(c=>c.passed),`Physics divergence; see ${reportPath}`);
    console.log(`PASS ${cases.length} physics cases`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
