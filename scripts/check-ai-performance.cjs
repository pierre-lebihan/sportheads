const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const v2 = process.argv.includes('--v2');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-ai-performance.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      window.aiCosts = [];
      const instantiate = WebAssembly.instantiateStreaming;
      WebAssembly.instantiateStreaming = async (...args) => {
        const result = await instantiate(...args), e = result.instance.exports;
        return { ...result, instance: { exports: { ...e, game_ai_plan(...parameters) {
          const start = performance.now(), mask = e.game_ai_plan(...parameters);
          aiCosts.push(performance.now() - start); return mask;
        } } } };
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    await page.click('#play-ai'); await page.check('[name="ai-level"][value="expert"]');
    for (let i = 0; i < 3; i++) await page.click('#setup-next');
    await page.selectOption('#bonuses', v2 ? '2' : '0'); await page.click('#start');
    await page.waitForFunction(() => sportheads.snapshot().phase === 1);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(v2 => { aiCosts.length = 0; const e = sportheads.engine; e.game_probe_start(550, 430, 60, 0); if (v2) { e.game_set_bonus_mode(2); for(let id=19;id<=23;id++)for(const side of [0,1])e.game_collect(id,side); } }, v2);
    const frames = await page.evaluate(() => new Promise(resolve => {
      const gaps = []; let previous, begin;
      function frame(time) {
        if (begin === undefined) begin = time;
        if (previous !== undefined) gaps.push(time - previous);
        previous = time;
        if (time - begin >= 6000) resolve(gaps); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }));
    const costs = await page.evaluate(() => aiCosts);
    const percentile = (values, p) => values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
    const result = { passed: true, bonusV2: v2, cpuSlowdown: 4, frames: frames.length, plans: costs.length,
      frameP95Ms: percentile(frames, .95), frameMaxMs: Math.max(...frames),
      planP95Ms: percentile(costs, .95), planMaxMs: Math.max(...costs), physicalDeviceTested: false };
    console.log(JSON.stringify(result));
    assert.ok(costs.length >= 4, 'the real Expert planner was exercised');
    assert.ok(result.frameP95Ms <= 50, 'at least 95% of frames stay within 50 ms under 4x CPU slowdown');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
