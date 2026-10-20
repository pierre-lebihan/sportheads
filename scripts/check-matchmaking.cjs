// Real PeerServer + WebRTC matchmaking: independent browser contexts, no mocks.
// The pages queue in a private lobby so they never meet real players.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/check-matchmaking.cjs URL');
const lobby = 'sportheads-lobby-check-' + require('node:crypto').randomBytes(6).toString('hex');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } });
    await context.addInitScript(id => { window.SPORTHEADS_LOBBY = id; }, lobby);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    assert.equal((await page.goto(target)).status(), 200);
    await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  const state = page => page.evaluate(() => sportheads.state);
  const waitConnected = page => page.waitForFunction(() => sportheads.state.connected, { timeout: 40000 });
  const search = async page => { await page.click('#play-online'); await page.click('#matchmaking-toggle'); };
  const waitWaiting = page => page.waitForFunction(() => /premier en attente/.test(document.querySelector('#room-status').textContent), { timeout: 25000 });
  try {
    const first = await pageAt();
    assert.equal(await first.locator('.play-modes button').count(), 3);
    await search(first);
    assert.equal(await first.locator('.matchmaking-search').isVisible(), true);
    assert.equal(await first.locator('#matchmaking-toggle').innerText(), 'Arrêter le matchmaking');
    assert.equal(await first.locator('#create-room').isEnabled(), false);
    await waitWaiting(first);
    assert.deepEqual(await first.evaluate(() => [sportheads.state.mode, sportheads.state.matchmaking, sportheads.state.setupStep]), ['online', true, 'room']);
    await first.screenshot({ path: 'evidence/matchmaking-waiting.png' });
    // The same button stops the search and leaves the line at once.
    await first.click('#matchmaking-toggle');
    assert.deepEqual(await first.evaluate(() => [sportheads.state.setupStep, sportheads.state.matchmaking, sportheads.state.busy]), ['room', false, false]);
    assert.equal(await first.locator('#matchmaking-toggle').innerText(), 'Lancer le matchmaking');
    assert.equal(await first.locator('#create-room').isEnabled(), true);
    await first.click('#matchmaking-toggle'); await waitWaiting(first);

    // The second player unlocked the family caricatures; the first did not.
    const second = await pageAt(url + (url.includes('?') ? '&' : '?') + 'groupe=famille');
    await search(second);
    await Promise.all([waitConnected(first), waitConnected(second)]);
    assert.equal((await state(first)).role, 'host'); assert.equal((await state(second)).role, 'guest');
    for (const page of [first, second]) {
      assert.equal((await state(page)).setupStep, 'players');
      assert.match(await page.locator('#room-status').innerText(), /Adversaire trouvé/);
      assert.equal(await page.locator('#room-details').isVisible(), false);
    }
    const friend = await second.evaluate(() => [...document.querySelector('#skin-right').options].find(option => option.textContent === 'Pierre').value);
    assert.equal(await first.evaluate(id => [...document.querySelector('#skin-right').options].some(option => option.value === id), friend), false, 'friends stay hidden without the link');
    await second.selectOption('#skin-right', friend);
    await first.waitForFunction(id => document.querySelector('#skin-right').value === id, friend);
    await first.screenshot({ path: 'evidence/matchmaking-paired.png' });

    // A paired room is no longer in the line: the next two players meet each other.
    const third = await pageAt(); await search(third); await waitWaiting(third);
    const fourth = await pageAt(); await search(fourth);
    try { await Promise.all([waitConnected(third), waitConnected(fourth)]); }
    catch (e) { for (const p of [third, fourth]) console.log(await p.evaluate(() => JSON.stringify([sportheads.state.role, sportheads.state.busy, document.querySelector('#room-status').textContent, document.querySelector('#network-report').textContent.slice(0, 3000)]))); throw e; }
    assert.equal((await state(first)).connected, true); assert.equal((await state(second)).connected, true);

    // The first pair plays; the guest controls only Red.
    await first.click('#setup-next'); await first.click('#setup-next');
    await first.waitForFunction(() => !document.querySelector('#start').disabled, { timeout: 20000 });
    await first.click('#start');
    await second.waitForFunction(() => sportheads.state.started, { timeout: 10000 });

    // Losing the opponent offers a new search without waiting for them.
    await fourth.context().close();
    await third.waitForFunction(() => !sportheads.state.connected, { timeout: 30000 });
    await third.waitForFunction(() => !document.querySelector('#matchmaking-again').hidden);
    await third.click('#matchmaking-again'); await waitWaiting(third);
    const fifth = await pageAt(); await search(fifth);
    await Promise.all([waitConnected(third), waitConnected(fifth)]);

    // Nobody else in the line: the search stops after its limit with a retry button.
    const lonely = await pageAt();
    await lonely.evaluate(() => { const original = window.setTimeout; window.setTimeout = (fn, ms, ...rest) => original(fn, ms === 180000 ? 3000 : ms, ...rest); });
    await search(lonely);
    await lonely.waitForFunction(() => document.querySelector('#matchmaking-toggle').textContent === 'Lancer le matchmaking', { timeout: 30000 });
    assert.match(await lonely.locator('#room-status').innerText(), /Personne n’est en attente/);
    assert.equal(await lonely.locator('.matchmaking-search').isVisible(), false);
    await lonely.screenshot({ path: 'evidence/matchmaking-timeout.png' });

    // Mobile: the search button fits on a phone.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(url); await phone.waitForFunction(() => window.ready); await phone.click('#play-online');
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= 390), true);
    await phone.screenshot({ path: 'evidence/matchmaking-phone.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, transport: 'real PeerServer + WebRTC', checks: ['waiting screen', 'cancel', 'pairing', 'friend caricatures', 'two concurrent pairs', 'match start', 'opponent lost then new search', 'search limit', 'phone layout'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
