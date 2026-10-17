// Lose release notifications deliberately, using real browser touch gestures.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-touch-release.cjs URL');
(async () => {
  for (const [name, type, options] of [['Chromium', chromium, { channel: 'chrome', args: ['--no-proxy-server'] }], ['WebKit', webkit, {}]]) {
    const browser = await type.launch({ headless: true, ...options });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await context.addInitScript(() => {
        window.dropPointerRelease = false; window.dropTouchRelease = false;
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, event => {
          if (window.dropPointerRelease) event.stopImmediatePropagation();
        }, true);
        for (const type of ['touchend', 'touchcancel']) window.addEventListener(type, event => {
          if (window.dropTouchRelease) event.stopImmediatePropagation();
        }, true);
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      await goToSetup(page, 'rules'); await page.locator('#bonuses').uncheck(); await page.click('#start');
      await page.waitForFunction(() => sportheads.snapshot().phase === 1);
      const left = page.locator('[data-side="0"] [data-action="1"]'), right = page.locator('[data-side="0"] [data-action="2"]');
      await page.evaluate(() => { window.dropPointerRelease = true; });
      await left.tap();
      assert.equal(await left.getAttribute('aria-pressed'), 'false', 'native touchend must clear a lost pointer release');
      await left.tap();
      assert.equal(await left.getAttribute('aria-pressed'), 'false', 'repeated taps cannot accumulate a phantom finger');
      await page.evaluate(() => { window.dropTouchRelease = true; });
      await left.tap();
      assert.equal(await left.getAttribute('aria-pressed'), 'true', 'fault leaves a stale contact when every end event is withheld');
      await page.evaluate(() => { window.dropTouchRelease = false; window.dropPointerRelease = false; });
      await right.tap();
      assert.equal(await page.locator('.touch-pad .pressed').count(), 0, 'the next contact snapshot removes stale fingers');
      await page.keyboard.down('KeyD'); await left.tap();
      const before = await page.evaluate(() => {
        const e = sportheads.engine;
        for (let i = 0; i < e.game_body_count(); i++) if (e.game_body_value(i, 9) === 1) return e.game_body_value(i, 0);
      });
      await page.waitForFunction(x => {
        const e = sportheads.engine;
        for (let i = 0; i < e.game_body_count(); i++) if (e.game_body_value(i, 9) === 1) return e.game_body_value(i, 0) > x + 3;
      }, before);
      await page.keyboard.up('KeyD');
      await page.locator('#pause').click(); await page.locator('#resume').click();
      assert.equal(await page.locator('.touch-pad .pressed').count(), 0);
      const box = await left.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); assert.equal(await left.getAttribute('aria-pressed'), 'true');
      await page.mouse.move(1, 1); assert.equal(await left.getAttribute('aria-pressed'), 'true');
      await page.mouse.up(); assert.equal(await left.getAttribute('aria-pressed'), 'false');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ passed: true, browser: name, checks: ['lost pointer release', 'repeated taps', 'next gesture repairs missing touchend', 'keyboard remains independent', 'pause and resume', 'mouse capture and release'] }));
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
