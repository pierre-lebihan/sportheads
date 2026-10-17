// WebKit and Chromium are separate processes, with real PeerServer/WebRTC.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-cross-browser.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const pages = [], errors = [];
  async function pageAt(browser, target = url) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(({ interrupt, candidatesOnly }) => {
      window.networkEvents = []; window.testConnections = [];
      let Peer;
      const watch = connection => {
        window.testConnections.push(connection);
        connection.on('error', error => window.networkEvents.push({ scope: 'channel', type: error.type, message: error.message, ice: connection.peerConnection?.iceConnectionState }));
      };
      Object.defineProperty(window, 'Peer', { configurable: true, get: () => Peer, set: Original => {
        Peer = class extends Original {
          constructor(...args) { super(...args); window.testPeer = this; this.on('connection', connection => { if (interrupt && !candidatesOnly) this.interruptSignaling(); watch(connection); }); this.on('error', error => window.networkEvents.push({ scope: 'peer', type: error.type, message: error.message })); }
          interruptSignaling() {
            const original = this.socket._wsOpen;
            this.socket._wsOpen = () => false;
            setTimeout(() => { this.socket._wsOpen = original; this.emit('open', this.id); }, 1200);
          }
          connect(...args) { if (interrupt && !candidatesOnly) this.interruptSignaling(); const connection = super.connect(...args); watch(connection); return connection; }
        };
      } });
      if (candidatesOnly) {
        const Original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Original {
          constructor(...args) {
            super(...args);
            let interrupted = false;
            this.addEventListener('icecandidate', event => {
              if (!event.candidate || interrupted) return;
              interrupted = true; window.testPeer.interruptSignaling();
            });
          }
        };
      }
    }, { interrupt: process.argv.includes('--interrupt-signaling'), candidatesOnly: process.argv.includes('--interrupt-candidates') });
    if (process.argv.includes('--lan-only')) await context.addInitScript(() => {
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original { constructor(config, ...args) { super({ ...config, iceServers: [] }, ...args); } };
    });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    if (browser === chrome) {
      const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    }
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  try {
    for (const [hostBrowser, guestBrowser] of [[chrome, safari], [safari, chrome]]) {
      const host = await pageAt(hostBrowser);
      await host.click('#play-online'); await host.click('#create-room');
      await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
      const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
      const guest = await pageAt(guestBrowser, share.href); await guest.click('#join-room');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected)));
      await goToSetup(host, 'rules'); await host.fill('#target-score', '3');
      await guest.waitForFunction(() => document.querySelector('#target-score').value === '3');
      await host.click('#start'); await guest.waitForFunction(() => sportheads.snapshot().phase === 1);
      await guest.click('#pause'); await host.waitForFunction(() => sportheads.snapshot().paused);
      assert.deepEqual(await guest.evaluate(() => sportheads.snapshot().score), await host.evaluate(() => sportheads.snapshot().score));
      await guest.click('#resume'); await host.waitForFunction(() => !sportheads.snapshot().paused);
      if (process.argv.includes('--lan-only')) {
        await guest.waitForFunction(async () => {
          const stats = await window.testConnections.at(-1).peerConnection.getStats();
          return [...stats.values()].some(row => row.type === 'candidate-pair' && row.state === 'succeeded' && row.bytesReceived > 0
            && stats.get(row.localCandidateId)?.candidateType === 'host' && stats.get(row.remoteCandidateId)?.candidateType === 'host');
        });
      }
      // Inject a known transport failure only to verify the on-phone report UI.
      await guest.evaluate(() => window.testConnections.at(-1).emit('error', { type: 'negotiation-failed' }));
      assert.equal(await guest.locator('#network-diagnostic').isVisible(), true);
      const report = JSON.parse(await guest.locator('#network-report').textContent());
      assert.equal(report.revision, 4);
      assert.ok(report.candidateSignaling.incomingCandidates > 0);
      assert.ok(report.candidateSignaling.appliedCandidates > 0);
      assert.equal(report.candidateSignaling.rejectedCandidates, 0);
      if (process.argv.includes('--interrupt-signaling') || process.argv.includes('--interrupt-candidates')) {
        assert.ok(report.candidateSignaling.flushedSignals > 0, 'interrupted signals are sent after recovery');
      }
      assert.ok(report.connectivity?.remoteCandidates.length > 0, 'report keeps remote routes before channel is destroyed');
      assert.ok(report.events.some(event => event.event === 'channel-error' && event.type === 'negotiation-failed'));
      await guest.click('#network-diagnostic summary');
      assert.equal(await guest.locator('#copy-diagnostic').isVisible(), true);
      assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(JSON.stringify({ passed: true, host: hostBrowser === chrome ? 'Chromium' : 'WebKit', guest: guestBrowser === chrome ? 'Chromium' : 'WebKit', lanOnly: process.argv.includes('--lan-only') }));
      await host.context().close(); await guest.context().close();
    }
    assert.deepEqual(errors, []);
  } catch (error) {
    for (const page of pages) if (!page.isClosed()) console.error(await page.evaluate(() => ({ status: document.querySelector('#room-status').textContent, state: window.sportheads?.snapshot(), errors: window.networkEvents, channels: window.testConnections.map(connection => ({ open: connection.open, ice: connection.peerConnection?.iceConnectionState, connection: connection.peerConnection?.connectionState })) })).catch(() => null));
    throw error;
  } finally { await chrome.close(); await safari.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
