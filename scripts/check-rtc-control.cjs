// Manual network control: separate browser processes, no PeerJS or game protocol.
// Usage: node scripts/check-rtc-control.cjs URL [--webkit] [--lan-only] [--headed]
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');

const url = process.argv[2];
assert.ok(url && !url.startsWith('--'), 'Provide an HTTPS URL or a localhost page.');
const crossEngine = process.argv.includes('--webkit');
const lanOnly = process.argv.includes('--lan-only');
const headless = !process.argv.includes('--headed');

(async () => {
  const browsers = [], pages = [], pending = [[], []], ready = [false, false];
  const result = { control: true, separateProcesses: true, lanOnly, headless, peers: [] };
  try {
    for (let side = 0; side < 2; side++) {
      const isWebkit = crossEngine && side === 1;
      const browser = await (isWebkit ? webkit : chromium).launch({
        headless, ...(isWebkit ? {} : { channel: 'chrome' }),
      });
      browsers.push(browser);
      const context = await browser.newContext();
      await context.exposeBinding('relayControlCandidate', async (_source, candidate) => {
        const remote = 1 - side;
        if (!ready[remote]) pending[remote].push(candidate);
        else await pages[remote].evaluate(value => controlPc.addIceCandidate(value), candidate);
      });
      const page = await context.newPage();
      pages.push(page);
      await page.goto(url);
      await page.evaluate(lan => {
        window.controlAudit = { candidates: [], events: [], errors: [] };
        window.controlReceived = null;
        window.controlPc = new RTCPeerConnection({
          iceServers: lan ? [] : [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        controlPc.addEventListener('icecandidate', ({ candidate }) => {
          if (!candidate) return;
          controlAudit.candidates.push({
            type: candidate.type, protocol: candidate.protocol,
            family: candidate.address?.endsWith('.local') ? 'mdns'
              : candidate.address?.includes(':') ? 'ipv6' : candidate.address ? 'ipv4' : 'unknown',
          });
          relayControlCandidate(candidate.toJSON()).catch(error => controlAudit.errors.push(error.name));
        });
        for (const event of ['iceconnectionstatechange', 'icegatheringstatechange', 'connectionstatechange']) {
          controlPc.addEventListener(event, () => controlAudit.events.push({
            event, ice: controlPc.iceConnectionState,
            gathering: controlPc.iceGatheringState, connection: controlPc.connectionState,
          }));
        }
        controlPc.addEventListener('datachannel', ({ channel }) => {
          window.controlChannel = channel;
          channel.onmessage = event => { window.controlReceived = event.data; };
        });
      }, lanOnly);
    }

    async function applyDescription(side, description) {
      await pages[side].evaluate(value => controlPc.setRemoteDescription(value), description);
      ready[side] = true;
      for (const candidate of pending[side].splice(0)) {
        await pages[side].evaluate(value => controlPc.addIceCandidate(value), candidate);
      }
    }
    const offer = await pages[0].evaluate(async () => {
      window.controlChannel = controlPc.createDataChannel('sportheads-network-control');
      controlChannel.onmessage = event => { window.controlReceived = event.data; };
      const description = await controlPc.createOffer();
      await controlPc.setLocalDescription(description);
      return description;
    });
    await applyDescription(1, offer);
    const answer = await pages[1].evaluate(async () => {
      const description = await controlPc.createAnswer();
      await controlPc.setLocalDescription(description);
      return description;
    });
    await applyDescription(0, answer);
    await pages[0].waitForFunction(() => controlChannel.readyState === 'open', null, { timeout: 18000 });
    await pages[0].evaluate(() => controlChannel.send('control-request'));
    await pages[1].waitForFunction(() => controlReceived === 'control-request', null, { timeout: 3000 });
    await pages[1].evaluate(() => controlChannel.send('control-response'));
    await pages[0].waitForFunction(() => controlReceived === 'control-response', null, { timeout: 3000 });
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.error = error.name;
    process.exitCode = 1;
  } finally {
    for (let side = 0; side < pages.length; side++) {
      const evidence = await pages[side].evaluate(async () => {
        if (!window.controlPc) return { initialized: false };
        const stats = await controlPc.getStats();
        const pairs = [...stats.values()].filter(row => row.type === 'candidate-pair').map(row => ({
          state: row.state, localType: stats.get(row.localCandidateId)?.candidateType,
          remoteType: stats.get(row.remoteCandidateId)?.candidateType,
          requestsSent: row.requestsSent, responsesReceived: row.responsesReceived,
          bytesSent: row.bytesSent, bytesReceived: row.bytesReceived,
        }));
        return { ...controlAudit, ice: controlPc.iceConnectionState, gathering: controlPc.iceGatheringState, pairs };
      }).catch(error => ({ error: error.name }));
      result.peers.push({ engine: crossEngine && side === 1 ? 'webkit' : 'chrome',
        version: browsers[side].version(), ...evidence });
    }
    // IPs, local names, SDP and ICE credentials are never written to the report.
    console.log(JSON.stringify(result, null, 2));
    await Promise.all(browsers.map(browser => browser.close()));
  }
})().catch(error => { console.error(error.name); process.exitCode = 1; });
