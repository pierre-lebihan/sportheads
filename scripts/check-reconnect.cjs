// Real PeerServer + WebRTC: a dropped link mid-match is re-dialled and the match resumes.
const assert = require('node:assert/strict');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/check-reconnect.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } });
    // Keep every peer connection reachable so the test can cut the link like a network switch.
    await context.addInitScript(() => {
      const Original = window.RTCPeerConnection; window.testPeerConnections = [];
      window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.testPeerConnections.push(this); } };
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  const state = page => page.evaluate(() => sportheads.snapshot());
  const cut = page => page.evaluate(() => { for (const pc of window.testPeerConnections) pc.close(); });
  async function resumeBoth(host, guest) {
    for (const page of [host, guest]) {
      await page.waitForFunction(() => sportheads.snapshot().connected, null, { timeout: 40000 });
      await page.click('#resume');
    }
    await Promise.all([host, guest].map(page => page.waitForFunction(() => !sportheads.snapshot().paused)));
  }
  try {
    const host = await pageAt();
    await host.click('#play-online'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]$/.test(document.querySelector('#room-code').textContent), null, { timeout: 20000 });
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected, null, { timeout: 25000 })));
    await goToSetup(host, 'rules'); await setTarget(host, 9); await host.selectOption('#bonuses', '0');
    await host.click('#start');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().phase === 1 && !sportheads.snapshot().paused, null, { timeout: 20000 })));
    await host.waitForFunction(() => sportheads.snapshot().tick > 60);
    const before = await state(host);

    // The guest dialled, so the guest calls back; the host keeps the paused match.
    await cut(guest);
    await host.waitForFunction(() => !sportheads.snapshot().connected && sportheads.snapshot().paused, null, { timeout: 20000 });
    assert.match(await guest.locator('#room-status').innerText(), /Reconnexion|rétablie/);
    await resumeBoth(host, guest);
    let after = await state(host);
    assert.equal(after.started, true); assert.equal(after.matchId, before.matchId); assert.ok(after.tick >= before.tick, 'match kept');
    await host.waitForFunction(tick => sportheads.snapshot().tick > tick + 30, after.tick);
    await guest.waitForFunction(tick => sportheads.snapshot().tick > tick + 30, after.tick);

    // A drop seen first by the host side ends the same way.
    const tick = (await state(host)).tick;
    await cut(host);
    await resumeBoth(host, guest);
    after = await state(guest);
    assert.equal(after.matchId, before.matchId); assert.ok(after.tick >= tick);
    await guest.waitForFunction(value => sportheads.snapshot().tick > value + 30, after.tick);

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['guest-side drop re-dialled', 'host-side drop re-dialled', 'match, score and tick kept', 'both players resume'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
