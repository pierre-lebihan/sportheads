const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/check-ai.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const errors = [];
  try {
    for (const [browser, mobile] of [[chrome, false], [chrome, true], [safari, true]]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1024 }, isMobile: mobile, hasTouch: mobile });
      await context.addInitScript(() => {
        window.inputLog = []; window.socketCount = 0;
        const WS = window.WebSocket;
        window.WebSocket = class extends WS { constructor(...args) { super(...args); window.socketCount++; } };
        const instantiate = WebAssembly.instantiateStreaming;
        WebAssembly.instantiateStreaming = async (...args) => {
          const result = await instantiate(...args), original = result.instance.exports;
          return { ...result, instance: { exports: { ...original, game_tick(mask) {
            window.inputLog.push(mask); if (inputLog.length > 2000) inputLog.shift(); return original.game_tick(mask);
          } } } };
        };
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.stack || error.message));
      let cdp;
      if (browser === chrome) { cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); }
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      assert.ok(await page.locator('#play-ai').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `evidence/ai-home-${mobile ? 'mobile' : 'desktop'}-${browser === chrome ? 'chrome' : 'webkit'}.png` });
      for (const level of ['easy', 'normal', 'hard']) {
        await page.click('#play-ai');
        assert.equal(await page.evaluate(() => sportheads.snapshot().setupStep), 'difficulty');
        await page.locator(`[name="ai-level"][value="${level}"]`).check();
        assert.equal(await page.evaluate(() => sportheads.snapshot().difficulty), level);
        await page.screenshot({ path: 'evidence/ai-difficulty.png' });
        await page.click('#setup-next');
        await page.selectOption('#skin-left', '3'); await page.selectOption('#skin-right', '5');
        await page.click('#random-player-1'); assert.notEqual(await page.locator('#skin-right').inputValue(), '5');
        await page.click('#setup-back'); assert.equal(await page.evaluate(() => sportheads.snapshot().setupStep), 'difficulty');
        assert.ok(await page.locator(`[name="ai-level"][value="${level}"]`).isChecked());
        await page.click('#setup-next'); await page.click('#setup-next');
        await page.selectOption('#pitch', level === 'easy' ? '2' : level === 'normal' ? '6' : '18'); await page.click('#setup-next');
        assert.equal(await page.locator('#target-score').inputValue(), '7');
        await page.fill('#target-score', '1'); await page.uncheck('#bonuses'); await page.locator('#balance').fill('-1');
        await page.click('#start');
        await page.waitForFunction(() => sportheads.snapshot().phase === 1);
        assert.deepEqual(await page.evaluate(() => sportheads.snapshot().assists), [1, 0]);
        await page.evaluate(() => { inputLog.length = 0; });
        await page.keyboard.down('ArrowLeft');
        await page.waitForFunction(() => inputLog.some(mask => (mask & 15) === 1));
        await page.keyboard.up('ArrowLeft');
        await page.waitForFunction(() => inputLog.some(mask => mask & 240));
        assert.equal(await page.evaluate(() => socketCount), 0, 'AI runs without a matchmaking socket');
        if (mobile) {
          assert.ok(await page.locator('.touch-pad.blue').isVisible());
          assert.equal(await page.locator('.touch-pad.red').isVisible(), false);
          if (cdp) {
            const box = await page.locator('.touch-pad.blue [data-action="2"]').boundingBox();
            await page.evaluate(() => { inputLog.length = 0; });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 77 }] });
            await page.waitForFunction(() => inputLog.some(mask => (mask & 15) === 2));
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForFunction(() => !document.querySelector('.touch-pad.blue .pressed'));
          }
          await page.setViewportSize({ width: 844, height: 390 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: 'evidence/ai-mobile-landscape.png' });
          await page.setViewportSize({ width: 390, height: 844 });
        }
        await page.click('#pause');
        const tick = await page.evaluate(() => sportheads.snapshot().tick); await page.waitForTimeout(150);
        assert.equal(await page.evaluate(() => sportheads.snapshot().tick), tick);
        await page.click('#resume'); await page.waitForFunction(tick => sportheads.snapshot().tick > tick, tick);
        await page.click('#play-view');
        await page.click('#setup-back'); await page.click('#setup-back'); await page.click('#setup-back');
        assert.equal(await page.locator('[name="ai-level"]').first().isEnabled(), false, 'difficulty is locked during the match');
        await page.click('#close-settings'); await page.click('#resume');
        // Finish a genuine AI match to exercise final score, stopped controls,
        // replay and a fresh AI controller, without waiting for wall-clock play.
        await page.evaluate(async level => {
          const module = new URL(document.querySelector('script[type="module"]').src); module.pathname = module.pathname.replace('game.js', 'opponent.js');
          const { createOpponent } = await import(module.href), ai = createOpponent({ difficulty: level, seed: 1 }), e = sportheads.engine;
          e.game_start_on_pitch(1, 1, 0, 8);
          for (let tick = 0; tick < 6000 && e.game_value(0) !== 3; tick++) e.game_tick(ai.step(e) << 4);
          sportheads.render();
        }, level);
        assert.ok(await page.locator('#finished').isVisible());
        assert.match(await page.locator('#result').innerText(), /IA/);
        await page.click('#again'); assert.equal(await page.evaluate(() => sportheads.snapshot().difficulty), level);
        assert.equal(await page.evaluate(() => sportheads.snapshot().phase), 0);
        await page.click('#play-view');
        for (let i = 0; i < 4; i++) await page.click('#setup-back');
        assert.equal(await page.evaluate(() => sportheads.snapshot().setupStep), 'home');
        // Next preparation starts afresh, with the defaults for this check.
        await page.evaluate(() => { document.querySelector('#target-score').value = '7'; });
      }
      await page.click('#play-local');
      assert.equal(await page.evaluate(() => sportheads.snapshot().difficulty), null);
      await page.click('#setup-next'); await page.click('#setup-next'); await page.click('#start');
      await page.waitForFunction(() => sportheads.snapshot().phase === 1);
      await page.evaluate(() => { inputLog.length = 0; });
      await page.waitForFunction(() => inputLog.length >= 10);
      assert.ok(await page.evaluate(() => inputLog.every(mask => mask === 0)), 'returning to local play stops all AI inputs');
      if (mobile) assert.ok(await page.locator('.touch-pad.red').isVisible());
      assert.equal(await page.locator('#difficulty-step').isVisible(), false);
      console.log(JSON.stringify({ passed: true, browser: browser === chrome ? 'Chromium' : 'WebKit', mobile, levels: 3, noServer: true, replay: true }));
      await context.close();
    }
    assert.deepEqual(errors, []);
  } finally { await chrome.close(); await safari.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
