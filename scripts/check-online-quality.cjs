// Real browser + native WebRTC, local signaling, intercepted analytics only.
// No production event or public PeerServer is used by this CI regression.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const { installLocalPeers } = require('./local-peer-fixture.cjs');
const site = path.resolve(__dirname, '../_site'), origin = 'https://sportheads.test';

(async () => {
  // Native WebRTC is the Chromium CI gate. --webkit is an explicit diagnostic:
  // on some macOS runners ICE stays new with no candidate pair, even though
  // offers/answers and candidates were accepted. Never count that as a pass.
  for (const type of process.argv.includes('--webkit') ? [webkit] : [chromium]) {
    const browser = await type.launch({ headless: true });
    const pages = [], errors = [];
    try {
      const options = { viewport: { width: 780, height: 480 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block' };
      const hostContext = await browser.newContext(options);
      const guestContext = await browser.newContext(options), seats = new Map();
      const events = [];
      for (const context of new Set([hostContext, guestContext])) {
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) {
          const file = path.join(site, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
          assert.ok(file.startsWith(site + path.sep));
          await route.fulfill({ path: file });
        } else if (url.hostname === 'eu.i.posthog.com') {
          if (route.request().method() === 'POST') events.push(route.request().postDataJSON());
          await route.fulfill({ json: { status: 'Ok' }, headers: { 'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
        } else await route.abort();
      });
      await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
        Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => null });
        Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => false });
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => raf(time => {
          if (window.slowGuest) setTimeout(() => callback(performance.now()), 30);
          else callback(time);
        });
      });
      await installLocalPeers(context, seats);
      }
      async function pageAt(context, url) {
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        pages.push(page);
        if (type === chromium) await (await context.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
        assert.equal(await page.evaluate(() => window.loadError), undefined);
        return page;
      }
      const host = await pageAt(hostContext, origin + '?stats=on'), guest = await pageAt(guestContext, origin + '?stats=off');
      await host.click('#play-online'); await host.click('#create-room');
      await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]$/.test(document.querySelector('#room-code').textContent));
      const code = await host.locator('#room-code').innerText();
      await guest.click('#play-online'); await guest.fill('#join-code', code); await guest.click('#join-room');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected)));
      await goToSetup(host, 'rules'); await host.selectOption('#bonuses', '0'); await setTarget(host, 9); await host.click('#start');
      await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().phase === 1)));
      await guest.evaluate(() => { window.slowGuest = true; });
      await guest.waitForFunction(() => sportheads.performance().scheduler.batterySaver, null, { timeout: 15000 });
      assert.equal(await guest.evaluate(() => document.querySelector('#field').width), 800, 'slow guest reduces the HD backing store');
      assert.equal(await guest.locator('#measure-performance, #measure-performance-paused, #performance-diagnostic').count(), 0);
      await guest.waitForFunction(() => sportheads.performance().onlineQuality?.frames > 0, null, { timeout: 20000 });
      const report = await guest.evaluate(() => sportheads.performance().onlineQuality);
      assert.equal(report.role, 'guest'); assert.ok(report.fps > 0); assert.ok(report.state_gap_samples > 0);
      assert.ok(report.input_ack_samples > 0); assert.ok(report.state_age_samples > 0); assert.ok(report.rtt_samples > 0);
      assert.equal(events.some(row => row.event === 'online_quality' && row.properties.role === 'guest'), false, 'guest opt-out blocks automatic analytics');
      await host.waitForFunction(() => sportheads.performance().onlineQuality?.frames > 0, null, { timeout: 20000 });
      const hostReport = await host.evaluate(() => sportheads.performance().onlineQuality);
      assert.equal(report.match_token, hostReport.match_token, 'both ends share the same random match token');
      assert.equal(report.realtime, true, 'native unreliable channel is negotiated');
      const transmitted = events.find(row => row.event === 'online_quality' && row.properties.role === 'host');
      assert.ok(transmitted, 'automatic summaries reach the existing capture pipeline');
      assert.ok(transmitted.properties.build); assert.equal(transmitted.properties.$browser_version !== undefined, true);
      assert.doesNotMatch(JSON.stringify(transmitted), /sportheads-room-v7|qualityToken|192\.168\.|candidate:|sdpMid/);
      assert.equal(new URL(transmitted.properties.$current_url).search, '');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ passed: true, browser: type.name(), nativeWebRTC: true, sharedMatchToken: true, guestSaver: true, automaticCapture: true, optOut: true, physicalDeviceTested: false }));
      await hostContext.close(); if (guestContext !== hostContext) await guestContext.close();
    } catch (error) {
      console.error(JSON.stringify({ browser: type.name(), errors, pages: await Promise.all(pages.map(page => page.evaluate(() => ({
        state: window.sportheads?.snapshot(), peers: window.__localPeerState?.(), network: document.querySelector('#network-report')?.textContent,
      })).catch(() => null))) }));
      throw error;
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
