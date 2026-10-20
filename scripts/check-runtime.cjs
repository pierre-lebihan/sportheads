const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-runtime.cjs URL');

(async () => {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.mainPlannerCalls = 0; window.ticksPerFrame = []; let ticks = 0;
        function frame() { ticksPerFrame.push(ticks); ticks = 0; requestAnimationFrame(frame); } requestAnimationFrame(frame);
        const instantiate = WebAssembly.instantiateStreaming;
        WebAssembly.instantiateStreaming = async (...args) => {
          const result = await instantiate(...args), e = result.instance.exports;
          return { ...result, instance: { exports: { ...e,
            game_tick(mask) { ticks++; return e.game_tick(mask); },
            game_ai_plan(...parameters) { mainPlannerCalls++; return e.game_ai_plan(...parameters); },
          } } };
        };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (type === chromium) await (await context.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      const boot = await page.evaluate(() => ({ assets: sportheads.performance().assets,
        resources: performance.getEntriesByType('resource').map(resource => resource.name) }));
      assert.equal(boot.assets.images, 21, 'load only the visible stadium, shared atlas and essential match graphics');
      assert.ok(boot.assets.decodedBytes < 8_000_000 && boot.assets.imageTransferBytes < 1_600_000);
      assert.ok(!boot.resources.some(name => /\/(heads-\d|pu-\d|modern-players\.png|pierre-vilma\.png|arthur\.png)/.test(name)), 'archive portraits and bonus sprites are not startup dependencies');
      await page.evaluate(() => { document.querySelector('#target-score').value = '9'; document.querySelector('#pitch').value = '3'; });
      assert.equal((await page.evaluate(() => sportheads.snapshot())).targetScore, 7, 'the DOM cannot silently change application configuration');
      assert.equal((await page.evaluate(() => sportheads.snapshot())).pitch, 8);
      await page.click('#play-ai'); await page.check('[name="ai-level"][value="expert"]'); await page.click('#setup-next');
      await goToSetup(page, 'rules'); await page.selectOption('#bonuses', '2'); await page.click('#start');
      await page.waitForFunction(() => sportheads.snapshot().phase === 1);
      await page.evaluate(() => { sportheads.engine.game_probe_start(550, 430, 60, 0); });
      await page.waitForFunction(() => sportheads.performance().planner.accepted >= 1 && sportheads.performance().planner.plans >= 2);
      assert.equal(await page.evaluate(() => mainPlannerCalls), 0, 'production AI never runs the native anticipator on the UI thread');
      await page.evaluate(() => { ticksPerFrame.length = 0; const start = performance.now(); while (performance.now() - start < 160) { /* simulate a busy display */ } });
      await page.waitForFunction(() => ticksPerFrame.length >= 6);
      assert.ok(await page.evaluate(() => Math.max(...ticksPerFrame) <= 2), 'display stalls cannot cause long simulation bursts');
      await page.click('#pause');
      const parity = await page.evaluate(async () => {
        const module = new URL(document.querySelector('script[type="module"]').src); module.pathname = module.pathname.replace('game.js', 'net-state.js');
        const { captureState } = await import(module.href);
        const before = captureState(sportheads.engine, [1, 2]); const replica = await sportheads.inspectPlanner();
        return { before, replica, after: captureState(sportheads.engine, [1, 2]), report: sportheads.performance() };
      });
      assert.deepEqual(parity.before, parity.replica, 'the actual Worker contains exactly the same authoritative numeric state');
      assert.deepEqual(parity.before, parity.after, 'querying a replica cannot change the real physics');
      assert.equal(parity.report.planner.status, 'ready'); assert.ok(parity.report.costs.aiWorker.samples > 0);
      await page.screenshot({ path: `evidence/runtime-${type.name()}.png` });
      await page.locator('#paused [data-quit-match]').click();
      assert.equal((await page.evaluate(() => sportheads.snapshot())).setupStep, 'home');
      assert.equal(await page.evaluate(() => sportheads.performance().planner.status), 'inactive');
      await page.click('#play-local'); await goToSetup(page, 'rules'); await page.click('#start');
      assert.equal(await page.evaluate(() => sportheads.snapshot().mode), 'local');
      assert.equal(await page.evaluate(() => sportheads.performance().planner.status), 'inactive');
      await page.waitForFunction(() => sportheads.snapshot().phase === 1);
      await page.click('#pause');
      assert.equal(await page.locator('#measure-performance-paused').isVisible(), true);
      await page.click('#measure-performance-paused');
      assert.equal(await page.evaluate(() => sportheads.snapshot().paused), false, 'measurement resumes the paused match');
      await page.waitForFunction(() => document.querySelector('#performance-status').textContent.startsWith('Mesure terminée'), null, { timeout: 15000 });
      const measured = JSON.parse(await page.locator('#performance-report').textContent());
      assert.ok(measured.costs.physics.samples > 0, 'diagnostic measures actual running physics');
      await page.click('#play-view');
      assert.equal(await page.locator('#performance-diagnostic').isVisible(), true, 'match settings retain the diagnostic');
      await page.click('#performance-diagnostic summary');
      assert.equal(await page.locator('#copy-performance').isVisible(), true);
      await page.click('#measure-performance');
      assert.equal(await page.evaluate(() => sportheads.snapshot().paused || sportheads.state.settingsOpen), false, 'measurement from settings resumes and closes settings');
      await page.click('#pause');
      await page.locator('#paused [data-quit-match]').click();
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ passed: true, performanceFromPause: true, performanceFromSettings: true, browser: type.name(), boot: boot.assets, workerParity: true, mainPlannerCalls: 0, maxCatchUpSteps: 2, physicalDeviceTested: false }));
      await context.close();

      const fallback = await browser.newContext();
      await fallback.addInitScript(() => { window.Worker = class { constructor() { throw Error('Worker unavailable for test'); } }; });
      const fallbackPage = await fallback.newPage();
      fallbackPage.on('pageerror', error => errors.push(error.message));
      if (type === chromium) await (await fallback.newCDPSession(fallbackPage)).send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await fallbackPage.goto(url); await fallbackPage.waitForFunction(() => window.ready);
      await fallbackPage.click('#play-ai'); await fallbackPage.click('#setup-next'); await goToSetup(fallbackPage, 'rules'); await fallbackPage.click('#start');
      await fallbackPage.waitForFunction(() => sportheads.snapshot().phase === 1);
      assert.equal(await fallbackPage.evaluate(() => sportheads.performance().planner.status), 'unavailable');
      const tick = await fallbackPage.evaluate(() => sportheads.snapshot().tick);
      await fallbackPage.waitForFunction(tick => sportheads.snapshot().tick > tick + 3, tick);
      assert.deepEqual(errors, []);
      await fallback.close();
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
