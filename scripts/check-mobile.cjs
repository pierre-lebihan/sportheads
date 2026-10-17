// Real multi-finger gestures against the WASM game and WebRTC room, via Chrome.
const assert = require('node:assert/strict');
const { goToSetup } = require('./setup-browser.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-mobile.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [], pages = [];
  async function mobile(viewport, target = url) {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    let points = [];
    return {
      page,
      async hold(actions) {
        points = [];
        for (const [side, action] of actions) {
          const box = await page.locator(`[data-side="${side}"] [data-action="${action}"]`).boundingBox();
          assert.ok(box && box.width >= 44 && box.height >= 44, 'finger-sized visible control');
          points.push({ id: points.length + 1, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 5, radiusY: 5, force: 1 });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      },
      async moveOutside() {
        points = points.map(point => ({ ...point, x: 1, y: 1 }));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
      },
      async releaseOne() { points.shift(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: points }); },
      async release(cancel = false) { points = []; await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); },
    };
  }
  const state = page => page.evaluate(() => sportheads.snapshot());
  const bodies = page => page.evaluate(() => {
    const e = sportheads.engine;
    return Array.from({ length: e.game_body_count() }, (_, i) => ({ role: e.game_body_value(i, 9), x: e.game_body_value(i, 0), y: e.game_body_value(i, 1), angle: e.game_body_value(i, 4) }));
  });
  async function waitTicks(page, amount) {
    await page.waitForFunction(tick => sportheads.snapshot().tick >= tick, (await state(page)).tick + amount);
  }
  async function fits(page) {
    assert.ok(await page.evaluate(() => {
      const arena = document.querySelector('.arena').getBoundingClientRect();
      const visible = [...document.querySelectorAll('.touch-pad:not([hidden]) button, #play-view, #pause')];
      return document.body.classList.contains('play-view') && document.documentElement.scrollWidth <= innerWidth
        && arena.top >= 0 && arena.bottom <= innerHeight + 1
        && visible.every(button => { const r = button.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    }), 'arena and controls fit the viewport');
  }
  try {
    const local = await mobile({ width: 390, height: 844 }), p = local.page;
    await p.setViewportSize({ width: 320, height: 568 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'small-phone menus fit');
    assert.equal(await p.locator('#play-local').isVisible(), true);
    assert.equal(await p.locator('#start').isVisible(), false);
    await p.screenshot({ path: 'evidence/setup-mobile-home.png' });
    await goToSetup(p, 'players');
    for (const [button, select] of [['#random-player-0', '#skin-left'], ['#random-player-1', '#skin-right']]) {
      const box = await p.locator(button).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 320, 'random player buttons fit small touch screens');
      const previous = await p.locator(select).inputValue(); await p.locator(button).tap();
      assert.notEqual(await p.locator(select).inputValue(), previous);
    }
    await p.screenshot({ path: 'evidence/setup-mobile-random-players.png' });
    await goToSetup(p, 'pitch');
    const pitchBefore = await p.locator('#pitch').inputValue(); await p.locator('#random-pitch').tap();
    assert.notEqual(await p.locator('#pitch').inputValue(), pitchBefore);
    assert.ok(await p.locator('.terrain-actions').evaluate(element => element.scrollWidth <= element.clientWidth), 'random terrain controls do not overflow');
    await p.screenshot({ path: 'evidence/setup-mobile-random-pitch.png' });
    await p.selectOption('#pitch', '8');
    await goToSetup(p, 'rules');
    assert.ok(await p.locator('#start').evaluate(button => { const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'small-phone start stays visible');
    await p.screenshot({ path: 'evidence/mobile-settings-small.png', fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('#bonuses').uncheck(); await p.locator('#start').tap();
    await p.waitForFunction(() => sportheads.snapshot().phase === 1);
    await fits(p);
    let before = await bodies(p);
    await local.hold([[0, 2], [0, 4], [0, 8], [1, 1], [1, 4], [1, 8]]);
    await waitTicks(p, 8);
    let after = await bodies(p);
    for (const role of [1, 2]) {
      const a = before.find(b => b.role === role), b = after.find(b => b.role === role);
      assert.ok(role === 1 ? b.x > a.x + 5 : b.x < a.x - 5, 'both touch players move');
      assert.ok(b.y < a.y - 10, 'both touch players jump while moving');
    }
    for (const role of [4, 5]) assert.ok(Math.abs(after.find(b => b.role === role).angle - before.find(b => b.role === role).angle) > .1, 'both touch players kick simultaneously');
    assert.equal(await p.locator('.touch-pad .pressed').count(), 6);
    await p.screenshot({ path: 'evidence/mobile-local-portrait.png' });
    await local.moveOutside();
    assert.equal(await p.locator('.touch-pad .pressed').count(), 6, 'capture keeps actions held outside buttons');
    assert.equal(await p.evaluate(() => scrollY), 0, 'multi-touch does not scroll');
    await local.release(); assert.equal(await p.locator('.touch-pad .pressed').count(), 0);
    await local.hold([[0, 2], [0, 8]]); await local.release(true);
    assert.equal(await p.locator('.touch-pad .pressed').count(), 0, 'OS cancellation releases every action');
    await local.hold([[0, 2]]); await p.locator('#pause').click();
    assert.equal((await state(p)).paused, true); assert.equal(await p.locator('.touch-pad .pressed').count(), 0);
    assert.equal(await p.locator('.touch-pad button:enabled').count(), 0);
    await local.release(); await p.locator('#resume').tap();
    // Touch and keyboard have independent ownership of the same action.
    await p.keyboard.down('KeyD'); await local.hold([[0, 2]]); await local.release();
    before = await bodies(p); await waitTicks(p, 5); after = await bodies(p);
    assert.ok(after.find(b => b.role === 1).x > before.find(b => b.role === 1).x + 2);
    await p.keyboard.up('KeyD');
    await p.setViewportSize({ width: 844, height: 390 }); await fits(p);
    await p.screenshot({ path: 'evidence/mobile-local-landscape.png' });
    await local.hold([[1, 1]]); await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await p.locator('.touch-pad .pressed').count(), 0); assert.equal((await state(p)).paused, true);
    await local.release(); await p.locator('#resume').tap();
    await p.locator('#play-view').tap();
    assert.equal(await p.locator('#welcome').isVisible(), true);
    assert.equal(await p.locator('.arena #balance').count(), 1);
    assert.equal((await state(p)).paused, true, 'returning to settings pauses');
    await p.locator('#close-settings').tap(); await fits(p); await p.locator('#resume').tap();
    // A fresh match cannot inherit held fingers.
    await local.hold([[0, 2]]); await p.locator('#restart').click(); await local.release();
    assert.equal(await p.locator('.touch-pad .pressed').count(), 0);
    // Check a smaller portrait phone too.
    await p.setViewportSize({ width: 320, height: 568 }); await fits(p);
    await p.screenshot({ path: 'evidence/mobile-local-small.png' });
    await local.hold([[0, 2], [0, 2]]); await local.releaseOne();
    assert.equal(await p.locator('.touch-pad .pressed').count(), 1, 'another finger still owns the same action');
    await local.release(); assert.equal(await p.locator('.touch-pad .pressed').count(), 0);
    await p.evaluate(() => {
      const e = sportheads.engine; let ticks = 0;
      while (e.game_value(0) !== 3 && ticks++ < 40000) e.game_tick(ticks % 120 < 60 ? 2 | 16 | 8 | 128 : 4 | 64);
      if (e.game_value(0) !== 3) throw Error('Mobile match did not end');
      sportheads.render();
    });
    assert.equal(await p.locator('#finished').isVisible(), true);
    assert.equal(await p.locator('.touch-pad button:enabled').count(), 0);
    await p.locator('#again').tap();
    assert.equal((await state(p)).phase, 0); assert.deepEqual((await state(p)).score, [0, 0]);
    await fits(p); await p.close();

    const host = await mobile({ width: 390, height: 844 }), h = host.page;
    await h.locator('#play-online').tap();
    await h.locator('#create-room').tap();
    await h.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const link = new URL(url); link.searchParams.set('room', await h.locator('#room-code').innerText());
    const guest = await mobile({ width: 844, height: 390 }, link.href), g = guest.page;
    await g.locator('#join-room').tap(); await h.waitForFunction(() => sportheads.snapshot().connected);
    await goToSetup(h, 'rules'); await h.locator('#bonuses').uncheck();
    await g.waitForFunction(() => sportheads.snapshot().setupStep === 'rules');
    assert.equal(await g.locator('#balance').isEnabled(), false);
    assert.equal(await g.locator('#skin-right').isEnabled(), true);
    await g.screenshot({ path: 'evidence/setup-mobile-guest-rules.png' });
    await h.locator('#start').tap();
    await Promise.all([h, g].map(page => page.waitForFunction(() => sportheads.snapshot().phase === 1 && sportheads.snapshot().started)));
    await fits(h); await fits(g);
    assert.equal(await h.locator('.touch-pad:not([hidden])').getAttribute('data-side'), '0');
    assert.equal(await g.locator('.touch-pad:not([hidden])').getAttribute('data-side'), '1');
    before = await bodies(h);
    await guest.hold([[1, 1], [1, 4], [1, 8]]); await waitTicks(h, 10); after = await bodies(h);
    assert.ok(after.find(b => b.role === 2).x < before.find(b => b.role === 2).x - 8, 'guest touch drives red over WebRTC');
    assert.ok(after.find(b => b.role === 2).y < before.find(b => b.role === 2).y - 10, 'guest jumps');
    assert.ok(Math.abs(after.find(b => b.role === 5).angle - before.find(b => b.role === 5).angle) > .1, 'guest kicks');
    assert.ok(Math.abs(after.find(b => b.role === 1).x - before.find(b => b.role === 1).x) < .1, 'guest cannot move blue');
    await guest.release();
    before = await bodies(h); await host.hold([[0, 2], [0, 4], [0, 8]]); await waitTicks(h, 8); after = await bodies(h);
    assert.ok(after.find(b => b.role === 1).x > before.find(b => b.role === 1).x + 5, 'host touch drives blue');
    assert.ok(after.find(b => b.role === 1).y < before.find(b => b.role === 1).y - 10, 'host jumps');
    await host.release(true);
    await guest.hold([[1, 2]]); await g.locator('#pause').click(); await h.waitForFunction(() => sportheads.snapshot().paused);
    assert.equal(await g.locator('.touch-pad .pressed').count(), 0); await guest.release();
    await g.screenshot({ path: 'evidence/mobile-online-landscape.png' });
    await g.locator('#resume').tap(); await h.waitForFunction(() => !sportheads.snapshot().paused);
    await h.screenshot({ path: 'evidence/mobile-online-portrait.png' });
    await guest.hold([[1, 1]]); await g.close(); await h.waitForFunction(() => !sportheads.snapshot().connected);
    assert.equal((await state(h)).paused, true); assert.equal(await h.locator('.touch-pad button:enabled').count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['portrait and landscape', '320px phone', 'six simultaneous fingers', 'move+jump+kick both players', 'capture and cancellation', 'pause/blur/restart clear input', 'independent fingers on one action', 'mobile victory and replay', 'keyboard/touch coexistence', 'settings and return', 'real mobile WebRTC host/guest input isolation', 'disconnect'], physicalDeviceTested: false }));
  } catch (error) {
    for (const [index, page] of pages.entries()) if (!page.isClosed()) {
      console.error(index, await state(page).catch(() => null));
      await page.screenshot({ path: `evidence/mobile-failure-${index}.png` }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
