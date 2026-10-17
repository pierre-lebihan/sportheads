// Real PeerServer + WebRTC integration: independent browser contexts, no mocks.
const assert = require('node:assert/strict');
const { goToSetup } = require('./setup-browser.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/check-online.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const contexts = [], errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } }); contexts.push(context);
    if (process.argv.includes('--relay')) await context.addInitScript(() => {
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original { constructor(config, ...rest) { super({ ...config, iceTransportPolicy: 'relay' }, ...rest); } };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    // Headless tabs stand in for two foreground windows on different computers.
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    assert.equal((await page.goto(target)).status(), 200);
    await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  const state = page => page.evaluate(() => sportheads.snapshot());
  const waitConnected = page => page.waitForFunction(() => sportheads.snapshot().connected, { timeout: 25000 });
  const bodyStates = page => page.evaluate(() => {
    const e = sportheads.engine;
    return Array.from({ length: e.game_body_count() }, (_, i) => Array.from({ length: 11 }, (_, f) => e.game_body_value(i, f)))
      .filter(b => b[9] > 0 && b[10] === 1).sort((a, b) => a[9] - b[9]);
  });
  try {
    const host = await pageAt();
    await host.click('#play-online');
    await host.fill('#join-code', 'BAD'); await host.click('#join-room');
    assert.match(await host.locator('#room-status').innerText(), /8 caractères/);
    await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent), { timeout: 20000 });
    const code = await host.locator('#room-code').innerText();
    await host.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    await host.click('#copy-code'); assert.equal(await host.evaluate(() => navigator.clipboard.readText()), code);
    await host.click('#copy-link');
    const copiedLink = new URL(await host.evaluate(() => navigator.clipboard.readText()));
    assert.equal(copiedLink.searchParams.get('room'), code); assert.equal(copiedLink.pathname, new URL(url).pathname);
    assert.equal((await state(host)).connected, false);
    assert.equal(await host.locator('#start').isEnabled(), false);
    await host.screenshot({ path: 'evidence/online-room-waiting.png', fullPage: true });
    const share = new URL(url); share.searchParams.set('room', code);
    const missing = await pageAt(); await missing.click('#play-online');
    await missing.fill('#join-code', require('node:crypto').randomBytes(8).toString('hex').slice(0, 8).replace(/[01]/g, 'X').toUpperCase());
    await missing.click('#join-room');
    await missing.waitForFunction(() => document.querySelector('#room-status').textContent.includes('introuvable'), { timeout: 25000 });
    assert.equal(await missing.locator('#create-room').isEnabled(), true); await missing.close();
    const guest = await pageAt(share.href);
    assert.equal(await guest.locator('#play-online').getAttribute('aria-pressed'), 'true');
    assert.equal(await guest.locator('#join-code').inputValue(), code);
    await guest.click('#join-room');
    await Promise.all([waitConnected(host), waitConnected(guest)]);
    assert.equal((await state(host)).role, 'host'); assert.equal((await state(guest)).role, 'guest');
    assert.equal(await guest.locator('#start').isVisible(), false);
    assert.equal(await guest.locator('#skin-left').isEnabled(), false);
    assert.equal(await host.locator('#skin-right').isEnabled(), false);
    await goToSetup(host, 'rules');
    await host.fill('#target-score', '3');
    await guest.waitForFunction(() => document.querySelector('#target-score').value === '3');
    assert.equal(await guest.locator('#target-score').isEnabled(), false);
    await guest.selectOption('#skin-right', '12');
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '12');
    // A third browser must be rejected without disturbing the existing match.
    const third = await pageAt(share.href); await third.click('#join-room');
    await third.waitForFunction(() => document.querySelector('#room-status').textContent.includes('complète'), { timeout: 25000 });
    assert.equal((await state(host)).connected, true); assert.equal((await state(guest)).connected, true);
    await host.click('#start');
    await guest.waitForFunction(() => sportheads.snapshot().started && sportheads.snapshot().targetScore === 3);
    assert.equal(await guest.locator('#clock').count(), 0, 'the goal target stays in settings');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().phase === 1 && !sportheads.snapshot().paused)));
    const before = await bodyStates(host);
    await guest.locator('#field').focus(); await guest.keyboard.down('ArrowLeft');
    await guest.waitForTimeout(300); await guest.keyboard.up('ArrowLeft');
    const afterGuest = await bodyStates(host);
    assert.ok(afterGuest.find(b => b[9] === 2)[0] < before.find(b => b[9] === 2)[0] - 8, 'guest controls red');
    assert.ok(Math.abs(afterGuest.find(b => b[9] === 1)[0] - before.find(b => b[9] === 1)[0]) < .1, 'guest cannot move blue');
    await host.locator('#field').focus(); await host.keyboard.down('ArrowRight'); await host.keyboard.down('ArrowUp'); await host.keyboard.down('KeyP');
    await host.waitForTimeout(300);
    for (const key of ['ArrowRight', 'ArrowUp', 'KeyP']) await host.keyboard.up(key);
    const afterHost = await bodyStates(host);
    assert.ok(afterHost.find(b => b[9] === 1)[0] > before.find(b => b[9] === 1)[0] + 8, 'host controls blue with arrows');
    assert.ok(afterHost.find(b => b[9] === 1)[1] < 430, 'host jumps');
    await host.click('#pause'); await guest.waitForFunction(() => sportheads.snapshot().paused);
    await guest.waitForFunction(tick => sportheads.snapshot().tick === tick, (await state(host)).tick);
    assert.deepEqual(await bodyStates(guest), await bodyStates(host), 'same authoritative bodies at pause');
    assert.deepEqual((await state(guest)).score, (await state(host)).score);
    // Both players own their pause: neither can resume while the other remains paused.
    await guest.click('#pause'); await host.waitForTimeout(150);
    await host.click('#resume'); await host.waitForTimeout(150);
    assert.equal((await state(host)).paused, true);
    const frozen = (await state(host)).tick; await host.waitForTimeout(180); assert.equal((await state(host)).tick, frozen);
    await guest.click('#resume'); await host.waitForFunction(() => !sportheads.snapshot().paused);
    await guest.waitForFunction(() => !sportheads.snapshot().paused);
    assert.equal(await guest.evaluate(() => document.activeElement.id), 'field', 'guest resumes keyboard control');
    assert.equal(await host.evaluate(() => document.activeElement.id), 'field', 'host resumes keyboard control');
    // Physics effects, score and result are transmitted, never simulated by the guest.
    await host.click('#pause'); await guest.waitForFunction(() => sportheads.snapshot().paused);
    await host.evaluate(() => { sportheads.engine.game_collect(14, 1); sportheads.render(); });
    await guest.waitForFunction(() => sportheads.renderState().players[1].scale === 1.5);
    assert.equal(await guest.evaluate(() => typeof sportheads.engine.game_tick), 'undefined');
    assert.deepEqual(await bodyStates(guest), await bodyStates(host));
    await host.screenshot({ path: 'evidence/online-match-host.png', fullPage: true });
    await guest.screenshot({ path: 'evidence/online-match-guest.png', fullPage: true });
    await host.evaluate(() => { sportheads.engine.game_probe_start(40, 400, 0, 0); sportheads.render(); });
    await host.click('#resume');
    await guest.waitForFunction(() => sportheads.snapshot().score[1] === 1);
    assert.equal(await guest.locator('#score-right').innerText(), '1');
    await guest.evaluate(() => window.dispatchEvent(new Event('blur')));
    await host.waitForFunction(() => sportheads.snapshot().paused);
    await guest.click('#resume'); await host.waitForFunction(() => !sportheads.snapshot().paused);
    await host.evaluate(() => {
      const e = sportheads.engine;
      e.game_start_match(7, 3, 0);
      let n = 0;
      while (e.game_value(0) !== 3 && n++ < 20000) e.game_tick(n % 120 < 60 ? 2 | 16 | 8 | 128 : 4 | 64);
      sportheads.render(); if (e.game_value(0) !== 3) throw Error('Match did not end');
    });
    await guest.waitForFunction(() => sportheads.snapshot().phase === 3);
    assert.deepEqual((await state(guest)).score, (await state(host)).score);
    assert.equal(Math.max(...(await state(guest)).score), 3);
    assert.equal(await guest.locator('#again').isEnabled(), false);
    await host.click('#again');
    await guest.waitForFunction(() => sportheads.snapshot().phase === 0 && sportheads.snapshot().matchId === 2);
    assert.deepEqual((await state(guest)).score, [0, 0]);
    assert.equal((await state(guest)).targetScore, 3);
    await guest.close();
    await host.waitForFunction(() => !sportheads.snapshot().connected);
    assert.equal((await state(host)).paused, true);
    assert.equal(await host.locator('#room-code').innerText(), code);
    // A replacement guest returns the host to the lobby for a fresh match.
    const replacement = await pageAt(share.href); await replacement.click('#join-room');
    await Promise.all([waitConnected(host), waitConnected(replacement)]);
    await host.waitForFunction(() => !sportheads.snapshot().started);
    assert.equal(await host.locator('#start').isEnabled(), true);
    await goToSetup(host, 'rules'); await host.click('#start'); await replacement.waitForFunction(() => sportheads.snapshot().started);
    await host.click('#play-view'); await host.click('#leave-room');
    await replacement.waitForFunction(() => !sportheads.snapshot().connected);
    assert.match(await replacement.locator('#room-status').innerText(), /déconnecté.*reste ouverte/);
    await host.click('#setup-back'); assert.equal(await host.locator('#online-panel').isVisible(), false); await host.click('#play-local'); await goToSetup(host, 'rules'); await host.click('#start'); assert.equal((await state(host)).mode, 'local');
    await replacement.setViewportSize({ width: 390, height: 844 });
    assert.ok(await replacement.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await replacement.screenshot({ path: 'evidence/online-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, transport: 'real PeerServer + WebRTC', checks: ['invalid/missing room', 'create/share/join', 'two-player limit', 'skin ownership', 'remote input isolation', 'identical authoritative state', 'shared pause/resume', 'bonus/score/result sync', 'blur pause', 'rematch', 'disconnect', 'replacement guest', 'return to local', 'mobile layout'] }));
  } catch (error) {
    for (let i = 0; i < contexts.length; i++) for (const page of contexts[i].pages()) {
      console.error('page', i, await page.evaluate(() => ({ status: document.querySelector('#room-status')?.textContent, state: window.sportheads?.snapshot(), hidden: document.hidden, focus: document.hasFocus() })).catch(() => 'closed'));
      await page.screenshot({ path: `evidence/online-failure-${i}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
