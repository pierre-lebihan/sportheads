// Deliberate fixture update command. Expected states come ONLY from Flash.
// Never run this automatically during builds or test execution.
const fs=require('node:fs');
const path=require('node:path');
const report=JSON.parse(fs.readFileSync('evidence/physics-parity.json'));
const scenes=require('./physics-scenes.cjs');
if(report.unexpectedErrors.length||!report.cases.every(c=>c.passed))throw new Error('Refusing to capture a failing investigation');
const directory='tests/fixtures/physics';fs.mkdirSync(directory,{recursive:true});
for(const c of report.cases){
  const scene=scenes.find(s=>s.name===c.name);const spec=c.spec;
  const lines=[`# ${c.name}`,`# Flash oracle; SWF SHA-256 6a8b371667a9f06da787301814f74afc7d6e80b5b8b0d9fb9b89e1982a559950`,`reset ${spec.gravity.join(' ')}`,`settings ${+Boolean(spec.continuous)} ${+Boolean(spec.sleep)}`];
  for(const [index,b] of spec.bodies.entries()){
    if(b.type==='polygon'){
      for(const vertex of b.vertices)lines.push(`vertex ${vertex.join(' ')}`);
      lines.push(`polygon ${[b.x,b.y,b.angle,b.density,b.friction,b.restitution,+b.fixed].join(' ')}`);
      lines.push(`velocity ${index} ${b.vx} ${b.vy} ${b.omega}`);
    }else {
    const values=b.type==='circle'?[b.x,b.y,b.radius,b.density,b.friction,b.restitution,+b.fixed,b.vx,b.vy,b.omega]
      :[b.x,b.y,b.hx,b.hy,b.angle,b.density,b.friction,b.restitution,+b.fixed,b.vx,b.vy,b.omega];
    lines.push(`${b.type} ${values.join(' ')}`);
    }
    lines.push(`flags ${index} ${b.group||0} ${+Boolean(b.bullet)} ${+(b.allow_sleep!==false)}`);
  }
  for(const j of spec.joints)lines.push(`joint ${[j.a,j.b,j.x,j.y,j.torque].join(' ')}`);
  const samples=new Set([0,1,10,17,29,30,31,45,59,60,61,spec.ticks]);
  let previousContacts=0;
  let previousSleeping="";
  c.flash.forEach((state,tick)=>{
    const contacts=[...state.contacts,...state.contactsDuringStep.flat()].reduce((sum,c)=>sum+c.points,0);
    const sleeping=state.bodies.map(b=>b.sleeping).join(',');
    if(spec.sleep && sleeping!==previousSleeping){samples.add(tick);previousSleeping=sleeping;}
    if(contacts!==previousContacts){samples.add(tick);previousContacts=contacts;}
  });
  for(let tick=0;tick<=spec.ticks;tick++){
    if(samples.has(tick)){
      lines.push(`# tick ${tick}`);
      c.flash[tick].bodies.forEach((b,i)=>lines.push(`expect ${i} ${['x','y','vx','vy','angle','omega','mass','inertia'].map(k=>b[k]).join(' ')}`));
      if(spec.sleep)c.flash[tick].bodies.forEach((b,i)=>lines.push(`expect_sleep ${i} ${+b.sleeping}`));
      c.flash[tick].joints.forEach((j,i)=>lines.push(`expect_joint ${i} ${j.angle} ${j.anchorError}`));
    }
    if(tick<spec.ticks){
      if(spec.kickAt?.tick===tick){const k=spec.kickAt;lines.push(`velocity ${k.body} ${k.vx} ${k.vy} ${k.omega||0}`);}
      if(scene.motor)spec.joints.forEach((_,i)=>lines.push(`motor ${i} ${scene.motor(tick)}`));
      lines.push('tick');
    }
  }
  fs.writeFileSync(path.join(directory,c.name+'.txt'),lines.join('\n')+'\n');
}
console.log('Captured',report.cases.length,'Flash-only golden fixtures');
