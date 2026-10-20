// Real PeerServer + WebRTC with 150 ms added to the guest's outgoing messages:
// the guest's own player must still answer its keys within a couple of frames,
// and end where the creator's authoritative simulation puts it.
const assert = require('node:assert/strict');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/check-prediction.cjs URL');
const DELAY = 150;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(target, delay = 0) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    if (delay) await context.addInitScript(delay => {
      const send = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function (data) { setTimeout(() => { if (this.readyState === 'open') send.call(this, data); }, delay); };
    }, delay);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  // The guest's displayed red player, and the creator's authoritative one.
  const shown = page => page.evaluate(() => { const e = sportheads.renderEngine; for (let i = 0; i < e.game_body_count(); i++) if (e.game_body_value(i, 9) === 2) return [e.game_body_value(i, 0), e.game_body_value(i, 1)]; });
  async function reaction(guest, key) {
    const before = await shown(guest);
    const started = Date.now(); await guest.keyboard.down(key);
    await guest.waitForFunction(([x, y]) => { const e = sportheads.renderEngine; for (let i = 0; i < e.game_body_count(); i++) if (e.game_body_value(i, 9) === 2) return Math.hypot(e.game_body_value(i, 0) - x, e.game_body_value(i, 1) - y) > 3; }, before, { polling: 'raf', timeout: 3000 });
    const ms = Date.now() - started; await guest.keyboard.up(key); return ms;
  }
  try {
    const host = await pageAt(url);
    await host.click('#play-online'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]$/.test(document.querySelector('#room-code').textContent), null, { timeout: 20000 });
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href, DELAY); await guest.click('#join-room');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected, null, { timeout: 25000 })));
    await goToSetup(host, 'rules'); await setTarget(host, 9); await host.selectOption('#bonuses', '0'); await host.click('#start');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().phase === 1 && !sportheads.snapshot().paused, null, { timeout: 20000 })));
    await guest.waitForTimeout(800);
    const walk = await reaction(guest, 'ArrowLeft');
    await guest.waitForTimeout(800);
    const jump = await reaction(guest, 'ArrowUp');
    // Both reactions come well before a round trip with the added delay.
    assert.ok(walk < DELAY, `walk shown after ${walk} ms`); assert.ok(jump < DELAY, `jump shown after ${jump} ms`);
    // Once idle, the prediction fades and the guest shows the creator's position.
    await guest.waitForTimeout(1500);
    const [guestView, hostView] = [await shown(guest), await shown(host)];
    assert.ok(Math.hypot(guestView[0] - hostView[0], guestView[1] - hostView[1]) < 4, `settled ${guestView} vs ${hostView}`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, addedDelayMs: DELAY, walkShownMs: walk, jumpShownMs: jump }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
