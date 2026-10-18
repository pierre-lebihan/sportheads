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
        const {BALANCED_PITCHES}=await module('pitch-geometry.js'), {drawPitch}=await module('render.js');
        const e=sportheads.engine, canvas=document.createElement('canvas');canvas.width=800;canvas.height=480;
        const ctx=canvas.getContext('2d'), checked=[];
        for(const id of Object.keys(BALANCED_PITCHES).map(Number)) {
          e.game_start_balanced_pitch(1,99,0,id);ctx.clearRect(0,0,800,480);drawPitch(ctx,id,true);
          const pixels=ctx.getImageData(0,0,800,480).data;
          const shapes=Array.from({length:e.game_body_count()-17},(_,offset)=>{
            const i=offset+17;return {x:e.game_body_value(i,0),y:e.game_body_value(i,1),a:e.game_body_value(i,4),r:e.game_body_value(i,8),
              hx:e.game_vertex_count(i)?e.game_vertex_value(i,2,0):0,hy:e.game_vertex_count(i)?e.game_vertex_value(i,2,1):0};
          });
          // Independently compare painted pixels with the actual native collision
          // shapes; ignore a one-pixel boundary where antialiasing is expected.
          for(let y=0;y<340;y+=2) for(let x=0;x<800;x+=2) {
            const distance=Math.min(...shapes.map(s=>{
              const dx=x+.5-s.x,dy=y+.5-s.y;
              if(s.r) return Math.hypot(dx,dy)-s.r;
              const px=Math.abs(dx*Math.cos(s.a)+dy*Math.sin(s.a))-s.hx;
              const py=Math.abs(-dx*Math.sin(s.a)+dy*Math.cos(s.a))-s.hy;
              return Math.hypot(Math.max(px,0),Math.max(py,0))+Math.min(Math.max(px,py),0);
            }));
            const alpha=pixels[(y*800+x)*4+3];
            if(distance < -1 && alpha < 240) throw Error(`Pitch ${id}: invisible collider at ${x},${y}`);
            if(distance > 1 && alpha > 15) throw Error(`Pitch ${id}: painted obstacle outside collider at ${x},${y}`);
          }
          checked.push(id);
        }
        return checked;
      });
      assert.deepEqual(checked,[2,4,6,9,14,15,16,17,18]);
      await page.click('#play-local'); await page.click('#setup-next');
      assert.equal(await page.locator('#pitch option').count(),16);
      for(const id of checked) {
        await page.selectOption('#pitch',String(id));
        await page.screenshot({path:`evidence/balanced-pitch-${type.name()}-${id}.png`});
      }
      await page.selectOption('#pitch','2');await page.click('#setup-next');await page.click('#start');
      assert.equal(await page.evaluate(()=>sportheads.engine.game_body_value(17,0)),400,'the actual game uses the corrected collider');
      assert.equal(await page.evaluate(()=>sportheads.renderState().balancedPitches),true);
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({passed:true,browser:type.name(),pitches:16,corrected:checked,drawnPixelsMatchNativeColliders:true,actualMatch:true}));
    } finally {await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
