const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-balanced-pitches.cjs URL');
(async () => {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch(type === chromium ? {channel:'chrome',headless:true,args:['--no-proxy-server']} : {headless:true});
    try {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url); await page.waitForFunction(()=>window.ready || window.loadError);
      assert.equal(await page.evaluate(()=>window.loadError),undefined);
      const checked=await page.evaluate(async()=>{
        const source=new URL(document.querySelector('script[type="module"]').src);
        const module=name=>{const u=new URL(source);u.pathname=u.pathname.replace('game.js',name);return import(u.href);};
        const {ORIGINAL_PITCHES,BONUS_PITCH_INFO}=await module('pitch-geometry.js'), {drawPitch,drawGame,drawSprite,drawStadium}=await module('render.js'), {PITCHES}=await module('selection.js');
        const e=sportheads.engine, canvas=document.createElement('canvas');canvas.width=800;canvas.height=480;
        const ctx=canvas.getContext('2d'), checked=[];
        for(const balanced of [true,false]) for(const id of balanced ? [...PITCHES,...BONUS_PITCH_INFO].map(p=>p.id) : Object.keys(ORIGINAL_PITCHES).map(Number)) {
          e[balanced ? 'game_start_balanced_pitch' : 'game_start_on_pitch'](1,99,0,id);ctx.clearRect(0,0,800,480);drawPitch(ctx,id,balanced);
          const pixels=ctx.getImageData(0,0,800,480).data;
          const shapes=Array.from({length:e.game_body_count()-17},(_,offset)=>{
            const i=offset+17;return {x:e.game_body_value(i,0),y:e.game_body_value(i,1),a:e.game_body_value(i,4),r:e.game_body_value(i,8),
              hx:e.game_vertex_count(i)?e.game_vertex_value(i,2,0):0,hy:e.game_vertex_count(i)?e.game_vertex_value(i,2,1):0};
          });
          // Independently compare painted pixels with the actual native collision
          // shapes. The decorative light outline extends 2.5 px beyond the
          // unchanged collision boundary, plus one pixel for antialiasing.
          for(let y=0;y<460;y+=2) for(let x=0;x<800;x+=2) {
            const distance=Math.min(...shapes.map(s=>{
              const dx=x+.5-s.x,dy=y+.5-s.y;
              if(s.r) return Math.hypot(dx,dy)-s.r;
              const px=Math.abs(dx*Math.cos(s.a)+dy*Math.sin(s.a))-s.hx;
              const py=Math.abs(-dx*Math.sin(s.a)+dy*Math.cos(s.a))-s.hy;
              return Math.hypot(Math.max(px,0),Math.max(py,0))+Math.min(Math.max(px,py),0);
            }));
            const alpha=pixels[(y*800+x)*4+3];
            if(distance < -1 && alpha < 240) throw Error(`Pitch ${id}: invisible collider at ${x},${y}`);
            if(distance > 3.5 && alpha > 15) throw Error(`Pitch ${id}: painted obstacle outside outlined collider at ${x},${y}`);
          }
          if(balanced)checked.push(id);
        }
        // Filled pockets extend behind the original top borders: the 45° corner
        // boxes (3 and 4) and the 8° walls (5 to 8). Their playable faces must
        // keep the same boundary, and no part of them may stay invisible.
        const baseline=document.createElement('canvas');baseline.width=800;baseline.height=540;
        const base=baseline.getContext('2d');
        drawStadium(base,3);
        drawSprite(base,'bottom-bar',1,0,0);drawSprite(base,'ground-texture',1,400,470,800,20);
        const comparison=document.createElement('canvas');comparison.width=800;comparison.height=480;
        const comparisonContext=comparison.getContext('2d');comparisonContext.drawImage(baseline,0,0);
        drawGame(ctx,null,{});
        const actual=ctx.getImageData(0,0,800,480).data, before=comparisonContext.getImageData(0,0,800,480).data;
        e.game_start_balanced_pitch(1,7,0,8);
        const borders=[3,4,5,6,7,8].map(i=>({x:e.game_body_value(i,0),y:e.game_body_value(i,1),a:e.game_body_value(i,4),
          hx:Math.abs(e.game_vertex_value(i,2,0)),hy:Math.abs(e.game_vertex_value(i,2,1))}));
        const changed=(x,y)=>{const index=(Math.floor(y)*800+Math.floor(x))*4;return Math.max(...[0,1,2,3].map(channel=>Math.abs(actual[index+channel]-before[index+channel])));};
        const distance=(x,y)=>Math.min(...borders.map(s=>{
          const dx=x-s.x,dy=y-s.y;
          const px=Math.abs(dx*Math.cos(s.a)+dy*Math.sin(s.a))-s.hx;
          const py=Math.abs(-dx*Math.sin(s.a)+dy*Math.cos(s.a))-s.hy;
          return Math.hypot(Math.max(px,0),Math.max(py,0))+Math.min(Math.max(px,py),0);
        }));
        const occupied=[0,0];
        for(let y=0;y<480;y+=2)for(let x=0;x<800;x+=2){
          const d=distance(x+.5,y+.5);
          if(changed(x,y)>5){
            if(d>3.5)throw Error(`Corner drawing beyond native border at ${x},${y}`);
            occupied[x<400?0:1]++;
          } else if(d<-1.5)throw Error(`Invisible arena border at ${x},${y}`);
        }
        for(const [side,s] of borders.slice(0,2).entries()){
          if(occupied[side]<2000 || changed(side?795:4,4)<10)throw Error('Corner pocket is not completely filled');
          for(const t of [-.75,-.5,-.25,0,.25,.5,.75]){
            const lx=side?-s.hx:s.hx,ly=t*s.hy;
            const x=s.x+lx*Math.cos(s.a)-ly*Math.sin(s.a),y=s.y+lx*Math.sin(s.a)+ly*Math.cos(s.a);
            if(changed(x,y)<10)throw Error(`Native bevel edge is invisible at ${x},${y}`);
          }
        }
        // The cached backdrop must retain the same exact markers.
        drawGame(ctx,null,{});
        if(ctx.getImageData(0,0,800,480).data.some((value,index)=>value!==actual[index]))throw Error('Backdrop cache changed the corner markers');
        return checked;
      });
      assert.deepEqual(checked,[2,3,4,5,6,7,8,9,11,14,15,16,17,18,21,22,23,24,25,26]);
      await page.click('#play-local'); await page.click('#setup-next');
      assert.equal(await page.locator('#pitch option').count(),14);
      for(const id of checked.filter(id=>id<=20)) {
        await page.selectOption('#pitch',String(id));
        await page.screenshot({path:`evidence/balanced-pitch-${type.name()}-${id}.png`});
      }
      await page.selectOption('#pitch','2');await page.click('#setup-next');await page.click('#start');
      assert.equal(await page.evaluate(()=>sportheads.engine.game_body_value(17,0)),400,'the actual game uses the corrected collider');
      assert.equal(await page.evaluate(()=>sportheads.renderState().balancedPitches),true);
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({passed:true,browser:type.name(),pitches:20,historicalPitches:19,graphite:checked,drawnPixelsMatchNativeColliders:true,visibleArenaCornersMatchNativeColliders:true,actualMatch:true}));
    } finally {await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
