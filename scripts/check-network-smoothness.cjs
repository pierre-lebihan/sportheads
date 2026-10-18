// Real WebRTC with controlled state delay, jitter and missing updates.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-network-smoothness.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      window.delayFrames = false; window.realtimeOptions = []; let frame = 0;
      const deliver = (message, send) => {
        if (!window.delayFrames || message?.type !== 'frame') { send(); return; }
        const n = frame++; if (n % 9 === 8) return;
        setTimeout(send, [100, 160, 110, 190, 120][n % 5]);
      };
      const create = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function (...args) {
        const channel = create.apply(this, args);
        window.realtimeOptions.push({ label: channel.label, ordered: channel.ordered, maxRetransmits: channel.maxRetransmits });
        return channel;
      };
      const send = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function (data) {
        if (this.label !== 'sportheads-realtime-v1') return send.call(this, data);
        deliver(JSON.parse(data), () => { if (this.readyState === 'open') send.call(this, data); });
      };
      const watch = connection => {
        const send = connection.send;
        connection.send = function (message) { deliver(message, () => { if (this.open) send.call(this, message); }); };
      };
      let Peer;
      Object.defineProperty(window, 'Peer', { configurable: true, get: () => Peer, set: Original => {
        Peer = class extends Original {
          constructor(...args) { super(...args); this.on('connection', watch); }
          connect(...args) { const connection = super.connect(...args); watch(connection); return connection; }
        };
      } });
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  try {
    const host = await pageAt(); await host.click('#play-online'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await host.waitForFunction(() => sportheads.snapshot().connected); await goToSetup(host, 'rules');
    await host.locator('#bonuses').selectOption('0'); await setTarget(host, 9); await host.click('#start');
    await guest.waitForFunction(() => sportheads.snapshot().phase === 1);
    await host.evaluate(() => { window.delayFrames = true; }); await host.keyboard.down('KeyD');
    const samples = await guest.evaluate(async () => {
      const rows = [];
      for (let n = 0; n < 120; n++) {
        await new Promise(requestAnimationFrame);
        const raw = sportheads.engine, view = sportheads.renderEngine || raw;
        const index = Array.from({ length: raw.game_body_count() }, (_, i) => i).find(i => raw.game_body_value(i, 9) === 1);
        rows.push({ raw: raw.game_body_value(index, 0), view: view.game_body_value(index, 0), phase: raw.game_value(0) });
      }
      return rows;
    });
    await host.keyboard.up('KeyD');
    let rawMoves = 0, viewMoves = 0, frames = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.phase !== 1 || b.phase !== 1 || Math.abs(b.raw - a.raw) > 60) continue;
      frames++; if (Math.abs(b.raw - a.raw) > .02) rawMoves++; if (Math.abs(b.view - a.view) > .02) viewMoves++;
    }
    console.log(JSON.stringify({ frames, rawMoves, viewMoves, delayMs: [100, 190], droppedUpdates: '1/9' }));
    assert.ok(frames >= 80);
    assert.ok(viewMoves > rawMoves * 1.35, 'presentation must move between irregular authoritative updates');
    assert.ok(viewMoves > frames * .75, 'most display frames remain animated under jitter');
    assert.ok(await host.evaluate(() => realtimeOptions.some(channel => channel.label === 'sportheads-realtime-v1' && !channel.ordered && channel.maxRetransmits === 0)));
    await host.click('#pause'); await guest.waitForFunction(() => sportheads.snapshot().paused);
    assert.equal(await guest.evaluate(() => sportheads.renderEngine === sportheads.engine), true, 'pause displays the exact authoritative state');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
