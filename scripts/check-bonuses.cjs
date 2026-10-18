const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {goToSetup,setTarget}=require('./setup-browser.cjs');
const url=process.argv[2];assert.ok(url,'Usage: node scripts/check-bonuses.cjs URL');
(async()=>{
 const chrome=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']}),safari=await webkit.launch({headless:true});
 const errors=[],pages=[];
 async function pageAt(browser,target=url){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  if(browser===chrome){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});}
  await page.goto(target);await page.waitForFunction(()=>window.ready||window.loadError);assert.equal(await page.evaluate(()=>window.loadError),undefined);return page;
 }
 try{
  for(const browser of [chrome,safari]){
   const page=await pageAt(browser),name=browser===chrome?'chromium':'webkit';
   for(const mode of [0,1,2]){
    await goToSetup(page,'rules');assert.deepEqual(await page.locator('#bonuses option').evaluateAll(options=>options.map(option=>+option.value)),[0,1,2]);
    await page.selectOption('#bonuses',String(mode));await setTarget(page,9);
    assert.equal(await page.locator('#v2-guide').isVisible(),mode===2);
    if(mode===2){await page.locator('#v2-guide summary').click();assert.equal(await page.locator('#v2-bonus-list li').count(),5);await page.screenshot({path:`evidence/bonuses-v2-guide-${name}.png`});}
    await page.click('#start');await page.waitForFunction(()=>sportheads.snapshot().phase===1);await page.click('#pause');
    assert.equal(await page.locator('#bonuses').isEnabled(),false);
    const result=await page.evaluate(mode=>{
     const e=sportheads.engine;if(mode===2){for(let id=19;id<=23;id++)for(const side of [0,1])e.game_collect(id,side);}
     else {for(let tick=0;tick<400;tick++)e.game_tick(0);e.game_collect(19,0);}
     sportheads.render();return {mode:e.game_bonus_value(0),values:Array.from({length:15},(_,f)=>e.game_bonus_value(f)),kinds:Array.from({length:e.game_pickup_count()},(_,i)=>e.game_pickup_value(i,0)),notice:e.game_value(10)};
    },mode);
    assert.equal(result.mode,mode);assert.ok(result.kinds.every(kind=>kind<=(mode===2?23:18)));
    if(mode===0)assert.equal(result.kinds.length,0);
    if(mode!==2)assert.notEqual(result.notice,19);
    if(mode===2){for(const field of [1,2,3,4,5,6,7,8])assert.ok(result.values[field]>0);await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>sportheads.renderState().bonus),result.values,'pause freezes every new effect');await page.screenshot({path:`evidence/bonuses-v2-match-${name}.png`});const png=await page.evaluate(()=>document.querySelector('#field').toDataURL());require('node:fs').writeFileSync(`evidence/bonuses-v2-field-${name}.png`,Buffer.from(png.split(',')[1],'base64'));}
    await page.locator('#paused [data-quit-match]').click();assert.equal(await page.evaluate(()=>sportheads.snapshot().setupStep),'home');
   }
   await page.context().close();console.log(JSON.stringify({passed:true,browser:name,mobile:true,modes:3,newBonuses:5,pauseFreezesTimers:true}));
  }
  const host=await pageAt(chrome);await host.click('#play-online');await host.click('#create-room');
  await host.waitForFunction(()=>!document.querySelector('#room-details').hidden&&/^[A-HJ-NP-Z2-9]{8}$/.test(sportheads.snapshot().code));
  const share=new URL(url);share.searchParams.set('room',await host.locator('#room-code').innerText());const guest=await pageAt(safari,share.href);await guest.click('#join-room');
  await Promise.all([host,guest].map(page=>page.waitForFunction(()=>sportheads.snapshot().connected)));
  await goToSetup(host,'rules');await guest.waitForFunction(()=>sportheads.snapshot().setupStep==='rules');
  for(const mode of [0,1,2]){await host.selectOption('#bonuses',String(mode));await guest.waitForFunction(mode=>document.querySelector('#bonuses').value===String(mode),mode);assert.equal(await guest.locator('#bonuses').isEnabled(),false);}
  // A still-open older guest must refresh before starting the expanded pool.
  await guest.evaluate(async()=>{
   const source=new URL(document.querySelector('script[type=module]').src);source.pathname=source.pathname.replace('game.js','rooms.js');
   const {Room}=await import(source.href),send=Room.prototype.send;
   Room.prototype.send=function(message,options){if(window.oldBonusClient&&message.type==='input'){message={...message};delete message.bonusV2;}return send.call(this,message,options);};window.oldBonusClient=true;
  });
  await host.waitForFunction(()=>document.querySelector('#start').disabled&&document.querySelector('#start').textContent.includes('actualiser'));
  await guest.evaluate(()=>{window.oldBonusClient=false;});await host.waitForFunction(()=>!document.querySelector('#start').disabled);
  await host.click('#start');await guest.waitForFunction(()=>sportheads.snapshot().phase===1);await host.click('#pause');await guest.waitForFunction(()=>sportheads.snapshot().paused);
  await host.evaluate(()=>{for(let id=19;id<=23;id++)for(const side of [0,1])sportheads.engine.game_collect(id,side);sportheads.render();});
  await guest.waitForFunction(()=>sportheads.engine.game_bonus_value(1)===240&&sportheads.engine.game_bonus_value(8)===180);
  const a=await host.evaluate(()=>sportheads.renderState().bonus),b=await guest.evaluate(()=>sportheads.renderState().bonus);assert.deepEqual(a,b);
  assert.equal(await guest.evaluate(()=>typeof sportheads.engine.game_tick),'undefined');
  await host.click('#resume');await guest.waitForFunction(()=>sportheads.engine.game_bonus_value(7)<180);
  await host.click('#pause');await guest.waitForFunction(()=>sportheads.snapshot().paused);
  await host.evaluate(()=>sportheads.engine.game_set_bonus_mode(0));
  await guest.waitForFunction(()=>sportheads.engine.game_bonus_value(1)===0&&sportheads.engine.game_bonus_value(8)===0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,online:true,host:'chromium',guest:'webkit',readonlyModes:true,synchronizedEffects:true,oldClientGate:true}));
 }catch(error){for(const page of pages)if(!page.isClosed())console.error(await page.evaluate(()=>({state:sportheads.snapshot(),status:document.querySelector('#room-status').textContent})).catch(()=>null));throw error;}
 finally{await chrome.close();await safari.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
