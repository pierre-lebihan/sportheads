// Exercise the visible portrait grid, including actual WebRTC lobby updates.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-character-selection.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const errors = [];
  async function pageAt(browser, target = url, width = 390, height = 844) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (browser === chrome) await (await context.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  const tile = (page, id) => page.locator(`[data-character="${id}"]`);
  const skins = page => page.evaluate(() => sportheads.renderState().skins);
  try {
    for (const browser of [chrome, safari]) {
      const page = await pageAt(browser);
      await page.click('#play-local');
      assert.equal(await page.locator('.character-tile').count(), 17);
      await tile(page, 3).click(); await page.click('#choose-side-1'); await tile(page, 5).click();
      assert.deepEqual(await skins(page), [3, 5]);
      assert.equal(await page.locator('#fighter-name-0').innerText(), 'Lamine Yamal');
      assert.equal(await page.locator('#fighter-name-1').innerText(), 'Jude Bellingham');
      assert.equal(await tile(page, 3).getAttribute('data-blue'), 'true');
      assert.equal(await tile(page, 5).getAttribute('data-red'), 'true');
      await tile(page, 3).click(); assert.deepEqual(await skins(page), [3, 3]);
      assert.match(await tile(page, 3).getAttribute('aria-label'), /Bleu et Rouge/);
      assert.ok(await tile(page, 3).locator('.character-marker.blue').isVisible());
      assert.ok(await tile(page, 3).locator('.character-marker.red').isVisible());
      await page.click('#random-player-0');
      const afterRandom = await skins(page); assert.notEqual(afterRandom[0], 3); assert.equal(afterRandom[1], 3);
      assert.equal(await page.locator('#roster-target').innerText(), 'Choix pour Bleu');
      await tile(page, 1).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
      assert.equal((await skins(page))[0], 2, 'keyboard selects the focused portrait');
      for (const [width, height] of [[320, 740], [390, 844], [844, 390], [1280, 1024]]) {
        await page.setViewportSize({ width, height });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.ok(await page.locator('.character-tile').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().width >= 44)));
        await page.locator('#character-roster').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `evidence/character-selection-${browser === chrome ? 'chrome' : 'webkit'}-${width}.png` });
      }
      await page.click('#choose-side-0'); await tile(page, 17).click();
      await page.click('#choose-side-1'); await tile(page, 16).click();
      assert.deepEqual(await skins(page), [17, 16]);
      assert.equal(await page.locator('#fighter-name-0').innerText(), 'Corentin');
      assert.equal(await page.locator('#fighter-name-1').innerText(), 'Marie');
      await page.screenshot({ path: `evidence/corentin-marie-${browser === chrome ? 'chrome' : 'webkit'}.png` });
      await page.click('#setup-next');
      assert.equal(await page.evaluate(() => sportheads.snapshot().setupStep), 'pitch');
      await page.click('#setup-back'); assert.deepEqual(await skins(page), [17, 16]);
      await page.click('#setup-back'); await page.click('#play-ai'); await page.click('#setup-next');
      await page.click('#choose-side-1'); await tile(page, 16).click();
      assert.equal(await page.locator('#fighter-role-1').innerText(), 'IA');
      assert.equal((await skins(page))[1], 16, 'human chooses Marie as the AI character');
      await page.click('#choose-side-0'); await tile(page, 17).click();
      await page.click('#setup-next'); await page.click('#setup-next'); await page.click('#start');
      assert.deepEqual(await skins(page), [17, 16]);
      assert.equal(await page.evaluate(() => sportheads.snapshot().started), true);
      await page.screenshot({ path: `evidence/corentin-marie-match-${browser === chrome ? 'chrome' : 'webkit'}.png` });
      await page.context().close();
    }
    const host = await pageAt(chrome), guest = await pageAt(safari);
    await host.click('#play-online'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const code = await host.locator('#room-code').innerText();
    await guest.click('#play-online'); await guest.fill('#join-code', code); await guest.click('#join-room');
    await Promise.all([host, guest].map(page => page.waitForFunction(() => sportheads.snapshot().connected)));
    assert.equal(await host.locator('#choose-side-1').isEnabled(), false);
    assert.equal(await guest.locator('#choose-side-0').isEnabled(), false);
    assert.ok(await guest.locator('#player-preview-0').isVisible());
    await tile(host, 6).click();
    await guest.waitForFunction(() => document.querySelector('#fighter-name-0').textContent === 'Cole Palmer');
    await tile(guest, 9).click();
    await host.waitForFunction(() => document.querySelector('#fighter-name-1').textContent === 'Achraf Hakimi');
    assert.deepEqual(await skins(host), [6, 9]); assert.deepEqual(await skins(guest), [6, 9]);
    // Opponent cards stay readable but cannot retarget the editable roster.
    await guest.locator('#choose-side-0').dispatchEvent('click'); await tile(guest, 6).click();
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '6');
    assert.deepEqual(await skins(host), [6, 6]);
    assert.equal(await tile(host, 6).getAttribute('data-red'), 'true');
    await host.screenshot({ path: 'evidence/character-selection-online-host.png' });
    await guest.screenshot({ path: 'evidence/character-selection-online-guest.png' });
    await tile(host, 17).click(); await tile(guest, 16).click();
    await Promise.all([host, guest].map(page => page.waitForFunction(() => document.querySelector('#fighter-name-0').textContent === 'Corentin' && document.querySelector('#fighter-name-1').textContent === 'Marie')));
    assert.deepEqual(await skins(host), [17, 16]); assert.deepEqual(await skins(guest), [17, 16]);
    assert.equal(await guest.locator('#setup-next').isVisible(), false);
    await host.click('#setup-next');
    await guest.waitForFunction(() => sportheads.snapshot().setupStep === 'pitch');
    assert.equal(await guest.locator('#character-roster').isVisible(), false);
    assert.equal(await guest.locator('#skin-right').isVisible(), true);
    await guest.selectOption('#skin-right', '17');
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '17');
    await host.click('#setup-back');
    await guest.waitForFunction(() => sportheads.snapshot().setupStep === 'players');
    assert.equal(await guest.locator('#fighter-name-1').innerText(), 'Corentin');
    assert.equal(await tile(guest, 17).getAttribute('aria-pressed'), 'true');
    await tile(guest, 16).click();
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '16');
    await host.click('#setup-next'); await host.click('#setup-next'); await host.click('#start');
    await guest.waitForFunction(() => sportheads.snapshot().started);
    assert.deepEqual(await skins(host), [17, 16]); assert.deepEqual(await skins(guest), [17, 16]);
    await guest.screenshot({ path: 'evidence/corentin-marie-online-match.png' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['17 visible portraits', 'choose either camp in local and AI', 'shared character markers', 'random targets the correct camp', 'keyboard', '320/390/844/1280 layout in Chrome and WebKit', 'live bidirectional choices before validation', 'online ownership', 'host validation and guest compact choice'] }));
  } finally { await Promise.all([chrome.close(), safari.close()]); }
})().catch(e => { console.error(e); process.exitCode = 1; });
