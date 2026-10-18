// Real PeerServer reservations and real page closes, without storage or a backend.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-rejoin.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const pages = [], errors = [];
  const state = page => page.evaluate(() => sportheads.snapshot());
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); pages.push(page);
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  const connected = page => page.waitForFunction(() => sportheads.snapshot().connected);
  async function settingsMatch(page) {
    await page.waitForFunction(() => document.querySelector('#pitch').value === '12'
      && document.querySelector('#target-score').value === '5' && document.querySelector('#balance').value === '-2'
      && !document.querySelector('#bonuses').checked);
  }
  try {
    const host = await pageAt(); await host.click('#play-online'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const code = await host.locator('#room-code').innerText(), share = new URL(url); share.searchParams.set('room', code);
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await Promise.all([connected(host), connected(guest)]);
    await host.selectOption('#skin-left', '11'); await guest.selectOption('#skin-right', '7');
    await goToSetup(host, 'pitch'); await host.selectOption('#pitch', '12');
    await goToSetup(host, 'rules'); await setTarget(host, 5);
    await host.locator('#balance').evaluate(input => { input.value = '-2'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await host.locator('#bonuses').uncheck(); await settingsMatch(guest);
    await host.click('#start'); await guest.waitForFunction(() => sportheads.snapshot().phase === 1);
    await host.close();
    await guest.waitForFunction(() => !sportheads.snapshot().connected);
    assert.equal(await guest.locator('#room-code').innerText(), code);
    assert.equal(await guest.locator('#room-details').isVisible(), true);
    assert.match(await guest.locator('#room-status').innerText(), /reste ouverte/);

    // Two people racing for the one vacant creator seat cannot both enter.
    const first = await pageAt(share.href), second = await pageAt(share.href);
    await Promise.all([first, second].map(page => page.click('#join-room')));
    await Promise.all([first, second].map(page => page.waitForFunction(() => sportheads.snapshot().connected
      || document.querySelector('#room-status').textContent.includes('complète'))));
    const returning = (await state(first)).connected ? first : second;
    const refused = returning === first ? second : first;
    assert.equal((await state(refused)).connected, false);
    assert.match(await refused.locator('#room-status').innerText(), /complète/); await refused.close();
    await connected(guest); await settingsMatch(returning);
    await returning.waitForFunction(() => document.querySelector('#start').textContent !== 'Chargement…' && !sportheads.snapshot().started);
    assert.equal((await state(returning)).role, 'host'); assert.equal((await state(guest)).role, 'guest');
    assert.equal((await state(returning)).code, code);
    assert.equal(await returning.locator('#skin-left').inputValue(), '11');
    assert.equal(await returning.locator('#skin-right').inputValue(), '7');
    assert.equal(await returning.locator('#skin-left').isEnabled(), true);
    assert.equal(await returning.locator('#skin-right').isEnabled(), false);
    await goToSetup(returning, 'rules'); await returning.click('#start');
    await guest.waitForFunction(() => sportheads.snapshot().started && sportheads.snapshot().targetScore === 5);
    assert.equal((await state(guest)).pitch, 12); assert.deepEqual((await state(guest)).assists, [2, 0]);
    const third = await pageAt(share.href); await third.click('#join-room');
    await third.waitForFunction(() => document.querySelector('#room-status').textContent.includes('complète'));
    assert.equal((await state(returning)).connected, true); assert.equal((await state(guest)).connected, true); await third.close();

    // Replacing the guest after a creator return must not restore default settings.
    await guest.close(); await returning.waitForFunction(() => !sportheads.snapshot().connected);
    const replacement = await pageAt(share.href); await replacement.click('#join-room');
    await Promise.all([connected(returning), connected(replacement)]); await settingsMatch(returning); await settingsMatch(replacement);
    await returning.close(); await replacement.waitForFunction(() => !sportheads.snapshot().connected);
    const typed = await pageAt(); await typed.click('#play-online'); await typed.fill('#join-code', code); await typed.click('#join-room');
    await Promise.all([connected(typed), connected(replacement)]); await settingsMatch(typed);
    assert.equal((await state(typed)).role, 'host'); assert.equal((await state(typed)).started, false);
    await goToSetup(typed, 'rules'); await typed.click('#start');
    await replacement.waitForFunction(() => sportheads.snapshot().started && sportheads.snapshot().targetScore === 5);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['real creator tab close', 'guest retains room code', 'return by link and typed code', 'two concurrent returns: one admitted', 'creator role and settings restored', 'new match after return', 'third player refused', 'replacement guest after creator return'] }));
  } catch (error) {
    for (const page of pages) if (!page.isClosed()) console.error(await page.evaluate(() => ({ state: sportheads.snapshot(), status: document.querySelector('#room-status').textContent })).catch(() => null));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
