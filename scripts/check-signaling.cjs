// Drop an actual offer after the app has sent it: the waiting creator stays
// silent, while diagnostics must distinguish this from a failed ICE route.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/check-signaling.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const errors = [];
  try {
    async function open(browser) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        window.dropOffers = false;
        const send = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
          if (window.dropOffers && typeof data === 'string' && JSON.parse(data).type === 'OFFER') return;
          return send.call(this, data);
        };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async value => { window.copiedDiagnostic = value; },
        } });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.stack || error.message));
      await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
      assert.equal(await page.evaluate(() => window.loadError), undefined);
      await page.click('#play-online');
      return page;
    }
    const host = await open(safari), guest = await open(chrome);
    await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]$/.test(document.querySelector('#room-code').textContent));
    const code = await host.locator('#room-code').innerText();
    assert.equal(await host.locator('#network-diagnostic').isVisible(), true, 'a waiting creator can inspect diagnostics without an error');
    await host.click('#network-diagnostic summary');
    assert.equal(JSON.parse(await host.locator('#network-report').textContent()).signaling.incomingOffers, 0);
    await guest.fill('#join-code', code); await guest.evaluate(() => { window.dropOffers = true; }); await guest.click('#join-room');
    await guest.waitForFunction(() => document.querySelector('#room-status').textContent.includes('Aucune réponse'), { timeout: 25000 });
    await guest.click('#network-diagnostic summary');
    const unanswered = JSON.parse(await guest.locator('#network-report').textContent());
    assert.equal(unanswered.signaling.outgoingOffers, 1); assert.equal(unanswered.signaling.incomingAnswers, 0);
    assert.equal(unanswered.connectivity.signaling, 'have-local-offer');
    assert.ok(!await host.locator('#room-status').evaluate(element => element.classList.contains('error')));
    await host.click('#copy-diagnostic');
    const waiting = JSON.parse(await host.evaluate(() => window.copiedDiagnostic));
    assert.equal(waiting.signaling.incomingOffers, 0); assert.equal(waiting.signaling.socketOpen, true);
    // A normal retry reaches the same creator. Copy must refresh even when the
    // details stayed open with the old zero-offer report throughout the test.
    await guest.evaluate(() => { window.dropOffers = false; }); await guest.click('#join-room');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected)));
    await host.click('#copy-diagnostic');
    const connected = JSON.parse(await host.evaluate(() => window.copiedDiagnostic));
    assert.equal(connected.connected, true);
    assert.equal(connected.signaling.incomingOffers, 1); assert.equal(connected.signaling.outgoingAnswers, 1);
    assert.doesNotMatch(JSON.stringify(connected), new RegExp(code));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, waitingCreator: 'WebKit', guest: 'Chromium', droppedOffer: true, sameRoomRetry: true, freshCopy: true }));
  } finally { await chrome.close(); await safari.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
