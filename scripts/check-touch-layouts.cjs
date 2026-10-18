const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; if (!url) throw Error('Usage: node scripts/check-touch-layouts.cjs URL');
(async () => {
  for (const type of [chromium, webkit]) {
    const browser = await type.launch(type === chromium ? { headless: true, channel: 'chrome', args: ['--no-proxy-server'] } : { headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.inputLog = [];
        window.touchTrace = [];
        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) window.addEventListener(type, event => {
          touchTrace.push({ type, touches: [...event.touches].map(t => [t.identifier, Math.round(t.clientX), Math.round(t.clientY)]) });
          if (touchTrace.length > 5) touchTrace.shift();
        }, true);
        const instantiate = WebAssembly.instantiateStreaming;
        WebAssembly.instantiateStreaming = async (...args) => {
          const result = await instantiate(...args), e = result.instance.exports;
          return { ...result, instance: { exports: { ...e, game_tick(mask) {
            inputLog.push(mask); if (inputLog.length > 300) inputLog.shift(); return e.game_tick(mask);
          } } } };
        };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.stack || error.message));
      let cdp, active = [];
      if (type === chromium) { cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); }
      const movement = '[data-side="0"] [data-movement]', jump = '[data-side="0"] [data-action="4"]', kick = '[data-side="0"] [data-action="8"]';
      const point = (id, selector, x = .5, y = .5) => ({ id, selector, x, y });
      async function gesture(spec) {
        const points = await page.evaluate(spec => spec.map(point => {
          const r = document.querySelector(point.selector).getBoundingClientRect();
          return { id: point.id, x: r.left + r.width * point.x, y: r.top + r.height * point.y };
        }), spec);
        const previousIds = active.map(point => point.id), ids = points.map(point => point.id);
        const event = ids.some(id => !previousIds.includes(id)) ? 'touchStart' : previousIds.some(id => !ids.includes(id)) ? 'touchEnd' : 'touchMove';
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: event,
          touchPoints: event === 'touchEnd' && points.length ? active.filter(point => !ids.includes(point.id)) : points });
        else await page.evaluate(({ spec, points, type }) => {
          const previous = window.layoutTouches || [];
          const contacts = points.map((point, i) => ({ identifier: point.id, clientX: point.x, clientY: point.y,
            target: previous.find(touch => touch.identifier === point.id)?.target || document.querySelector(spec[i].selector) }));
          const changed = type === 'touchstart' ? contacts.filter(touch => !previous.some(old => old.identifier === touch.identifier))
            : type === 'touchend' ? previous.filter(touch => !contacts.some(next => next.identifier === touch.identifier)) : contacts;
          const e = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(e, { touches: { value: contacts }, changedTouches: { value: changed } });
          (changed[0]?.target || window).dispatchEvent(e); window.layoutTouches = contacts;
        }, { spec, points, type: event.toLowerCase() });
        active = points;
      }
      const expectInput = async expected => {
        try { await page.waitForFunction(expected => inputLog.length && (inputLog.at(-1) & 15) === expected, expected, { timeout: 5000 }); }
        catch (error) { console.error(JSON.stringify(await page.evaluate(expected => ({ expected, inputs: inputLog.slice(-5), touches: touchTrace, state: sportheads.snapshot(), pressed: [...document.querySelectorAll('.touch-pad .pressed')].map(e => e.dataset.action) }), expected))); throw error; }
      };
      async function fits() {
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(await page.evaluate(() => {
          const buttons = [...document.querySelectorAll('.touch-pad:not([hidden]) button')].filter(button => button.getClientRects().length);
          return document.documentElement.scrollWidth <= innerWidth && buttons.every(button => {
            const r = button.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
          });
        }), 'every visible control remains finger-sized and on screen');
        if (await page.locator('#touch-layout').inputValue() === 'three-fingers') assert.ok(await page.evaluate(() => {
          const j = document.querySelector('.touch-pad.blue .index-jump').getBoundingClientRect(), f = document.querySelector('#field').getBoundingClientRect();
          return j.right <= f.left || j.left >= f.right || j.bottom <= f.top || j.top >= f.bottom;
        }), 'index jump never covers the playfield');
      }
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      assert.equal(await page.locator('#touch-layout').inputValue(), 'thumbs');
      await page.click('#play-ai'); for (let i = 0; i < 3; i++) await page.click('#setup-next');
      await page.fill('#target-score', '99'); await page.uncheck('#bonuses'); await page.click('#start');
      await page.waitForFunction(() => sportheads.snapshot().phase === 1);
      await gesture([point(1, movement, .15, .8), point(2, kick)]); await expectInput(9);
      await gesture([point(1, movement, .15, .2), point(2, kick)]); await expectInput(13);
      await gesture([point(1, movement, .85, .2), point(2, kick)]); await expectInput(14);
      await gesture([point(1, movement, .5, .2), point(2, kick)]); await expectInput(12);
      await gesture([point(1, movement, .5, .8), point(2, kick)]); await expectInput(8);
      await gesture([point(1, movement, .85, .2), point(2, kick)]); await expectInput(14);
      await gesture([point(1, movement, .85, .2)]); await expectInput(6);
      assert.equal(await page.locator(kick).getAttribute('aria-pressed'), 'false', 'no automatic kick after lifting the right thumb');
      await gesture([point(1, movement, .85, .8)]); await expectInput(2);
      await gesture([point(1, movement, .85, .45)]); await expectInput(2);
      await gesture([point(1, movement, .85, .35)]); await expectInput(6);
      await gesture([point(1, movement, .85, .45)]); await expectInput(6);
      await gesture([point(1, movement, .85, .7)]); await expectInput(2);
      // Switch while a finger is still down; moving that old contact must not
      // resurrect the held command under the new layout.
      await page.evaluate(() => { const select = document.querySelector('#touch-layout'); select.value = 'three-fingers'; select.dispatchEvent(new Event('change')); });
      await expectInput(0); await gesture([point(1, movement, .15, .8)]); await expectInput(0);
      await gesture([]);
      await gesture([point(1, movement, .85, .5), point(2, jump), point(3, kick)]); await expectInput(14);
      await gesture([point(1, movement, .85, .5), point(3, kick)]); await expectInput(10);
      await gesture([point(1, movement, .85, .5)]); await expectInput(2);
      await gesture([]); await expectInput(0);
      for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await fits();
        await page.screenshot({ path: `evidence/touch-three-${type.name()}-${viewport.width}.png` });
      }
      // The real settings path preserves the match, pauses it and permits this
      // personal setting even though gameplay rules are locked mid-match.
      const match = await page.evaluate(() => sportheads.snapshot().matchId);
      await page.click('#play-view'); await page.click('#touch-settings summary');
      assert.ok(await page.locator('#touch-layout').isEnabled());
      await page.selectOption('#touch-layout', 'thumbs');
      assert.equal(await page.evaluate(() => sportheads.snapshot().matchId), match);
      await page.screenshot({ path: 'evidence/touch-layout-settings.png' });
      await page.click('#close-settings'); await page.click('#resume');
      await gesture([point(1, movement, .15, .2), point(2, kick)]); await expectInput(13);
      await page.click('#pause');
      assert.equal(await page.locator('.touch-pad .pressed').count(), 0);
      await page.click('#resume'); await gesture([point(1, movement, .85, .2), point(2, kick)]); await expectInput(0);
      await gesture([]);
      await fits(); await page.screenshot({ path: `evidence/touch-thumbs-${type.name()}.png` });
      await page.click('#play-view'); await page.selectOption('#touch-layout', 'three-fingers');
      await page.reload(); await page.waitForFunction(() => window.ready);
      assert.equal(await page.locator('#touch-layout').inputValue(), 'three-fingers', 'layout survives a reload');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ passed: true, browser: type.name(), gestures: cdp ? 'native CDP multitouch' : 'DOM touch snapshots', independentActions: true, persisted: true, changedDuringMatch: true }));
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
