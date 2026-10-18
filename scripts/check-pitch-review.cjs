const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-pitch-review.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-proxy-server'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport:{width:1200,height:900}, permissions:['clipboard-read','clipboard-write'] });
    const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url); await page.waitForFunction(()=>window.reviewReady || window.reviewError);
    assert.equal(await page.evaluate(()=>window.reviewError), undefined);
    assert.equal(await page.locator('#near-pitches article').count(),9);
    assert.equal(await page.locator('#uneven-pitches article').count(),3);
    assert.equal(await page.locator('#kept-pitches article').count(),7);
    const ids = await page.locator('article').evaluateAll(articles=>articles.map(a=>+a.dataset.pitch).sort((a,b)=>a-b));
    assert.deepEqual(ids, Array.from({length:19},(_,i)=>i+2));
    const image = ()=>page.locator('[data-pitch="9"] canvas').evaluate(canvas=>canvas.toDataURL());
    const initial = await image(); await page.uncheck('#show-axis'); assert.notEqual(await image(),initial);
    const plain = await image(); await page.check('#show-mirror'); assert.notEqual(await image(),plain);
    await page.uncheck('#show-mirror'); await page.check('#show-axis');
    await page.check('[data-restore="9"]'); await page.check('[data-restore="13"]');
    await page.click('#copy-selection'); assert.equal(await page.evaluate(()=>navigator.clipboard.readText()), 'Remets les terrains 9, 13.');
    await page.locator('[data-pitch="9"]').screenshot({path:'evidence/pitch-review-9.png'});
    await page.screenshot({path:'evidence/pitch-review-desktop.png',fullPage:true});
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('[data-pitch="2"]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`evidence/pitch-review-mobile-${width}.png`});
    }
    await page.click('summary'); assert.equal(await page.locator('#kept-pitches').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,removed:12,near:9,uneven:3,kept:7,axis:true,mirror:true,copy:true,mobile:true}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
