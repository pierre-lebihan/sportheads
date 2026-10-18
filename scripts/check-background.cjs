// Real WebRTC and frozen Chrome pages reproduce leaving the browser to share a link.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-background.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const pages = [], sessions = [], errors = [];
  async function mobile(target = url) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      window.testPeers = [];
      let Peer;
      Object.defineProperty(window, 'Peer', { configurable: true, get: () => Peer, set: Original => {
        Peer = class extends Original { constructor(...args) { super(...args); window.testPeers.push(this); } };
      } });
    });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    sessions.push(cdp);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return { page, cdp };
  }
  async function freeze({ page, cdp }) {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  }
  async function resume({ page, cdp }) {
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  }
  const state = page => page.evaluate(() => sportheads.snapshot());
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    const host = await mobile(), h = host.page;
    await h.click('#play-online'); await h.click('#create-room');
    await h.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const code = await h.locator('#room-code').innerText();
    await h.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    await h.click('#copy-link');
    const share = await h.evaluate(() => navigator.clipboard.readText());
    assert.equal(new URL(share).searchParams.get('room'), code);
    await goToSetup(h, 'pitch'); await h.selectOption('#pitch', '7');
    // Close the real signalling WebSocket while the room has no guest yet.
    await h.evaluate(() => {
      const peer = testPeers[0];
      window.testDisconnected = false;
      peer.on('disconnected', () => { window.testDisconnected = true; });
      peer.socket._socket.close();
    });
    await h.waitForFunction(() => window.testDisconnected);
    assert.equal(await h.evaluate(() => testPeers[0].destroyed), false, 'waiting room survives a signalling outage');
    await freeze(host); await sleep(12000); await resume(host);
    await h.waitForFunction(() => testPeers[0].open && !testPeers[0].disconnected);
    assert.equal(await h.locator('#room-code').innerText(), code);
    assert.equal((await state(h)).setupStep, 'pitch');
    assert.equal(await h.locator('#pitch').inputValue(), '7');
    const joinInBackground = process.argv.includes('--join-during-background');
    if (joinInBackground) await freeze(host);
    const guest = await mobile(share), g = guest.page; await g.click('#join-room');
    if (joinInBackground) { await sleep(25000); await resume(host); }
    await Promise.all([h, g].map(page => page.waitForFunction(() => sportheads.snapshot().connected)));
    await g.waitForFunction(() => document.querySelector('#pitch').value === '7');
    // An established channel must also tolerate a phone sleeping for >8 seconds.
    await freeze(host); await sleep(15000);
    assert.equal((await state(g)).connected, true, 'foreground guest keeps the suspended host');
    await resume(host); await sleep(1200);
    assert.equal((await state(h)).connected, true);
    assert.equal((await state(g)).connected, true);
    await goToSetup(h, 'rules'); await h.fill('#target-score', '3');
    await g.waitForFunction(() => document.querySelector('#target-score').value === '3');
    await h.click('#start'); await g.waitForFunction(() => sportheads.snapshot().started);
    await freeze(guest);
    await h.waitForFunction(() => sportheads.snapshot().paused);
    const tick = (await state(h)).tick;
    await sleep(15000);
    assert.equal((await state(h)).connected, true, 'foreground host keeps the suspended guest');
    assert.equal((await state(h)).tick, tick, 'match stays paused in background');
    await resume(guest); await sleep(1200);
    assert.equal((await state(g)).connected, true);
    assert.equal((await state(g)).code, code);
    await g.click('#resume'); await h.waitForFunction(() => !sportheads.snapshot().paused);
    await g.waitForFunction(() => !sportheads.snapshot().paused);
    await g.close(); await h.waitForFunction(() => !sportheads.snapshot().connected);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['copy invitation', 'waiting room survives actual WebSocket loss', 'same code after frozen page', 'guest joins original invitation', 'connected host and guest freeze for 15 seconds', 'pause and resume', 'actual tab close still disconnects'], physicalDeviceTested: false }));
  } catch (error) {
    await Promise.all(sessions.map(cdp => cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})));
    for (const page of pages) if (!page.isClosed()) console.error(await state(page).catch(() => null));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
