const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-setup.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const pages = [], errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined); return page;
  }
  const state = page => page.evaluate(() => sportheads.snapshot());
  async function finish(page) {
    await page.evaluate(() => {
      const e = sportheads.engine; let ticks = 0;
      while (e.game_value(0) !== 3 && ticks++ < 40000) e.game_tick(ticks % 120 < 60 ? 2 | 16 | 8 | 128 : 4 | 64);
      if (e.game_value(0) !== 3) throw Error('Match did not finish'); sportheads.render();
    });
  }
  try {
    const local = await pageAt();
    assert.equal(await local.locator('#competition,#best-of,#tournament-panel,#tournament-setup').count(), 0);
    assert.equal(await local.locator('#pitch option').count(), 19);
    assert.equal(await local.locator('#skin-left option').count(), 12);
    assert.equal(await local.locator('#skin-left option').first().innerText(), 'Kylian Mbappé');
    assert.equal(await local.locator('#skin-left option').last().innerText(), 'Gianluigi Donnarumma');
    assert.deepEqual((await state(local)).assists, [0, 0]);
    const hashes = [];
    for (let skin = 1; skin <= 12; skin++) {
      await local.selectOption('#skin-left', String(skin));
      hashes.push(await local.evaluate(() => {
        const canvas = document.querySelector('#player-preview-0'), pixels = canvas.getContext('2d').getImageData(0, 0, 72, 72).data;
        let hash = 2166136261, occupied = 0;
        for (let i = 0; i < pixels.length; i++) { hash = Math.imul(hash ^ pixels[i], 16777619); if (i % 4 === 3 && pixels[i]) occupied++; }
        if (occupied < 500 || occupied > 4500) throw Error('Avatar empty or opaque rectangle');
        return hash;
      }));
    }
    assert.equal(new Set(hashes).size, 12, 'twelve distinct transparent portraits');
    await local.selectOption('#skin-left', '1'); await local.selectOption('#skin-right', '2');
    assert.equal(await local.locator('#assist-left,#assist-right').count(), 0);
    assert.deepEqual(await local.locator('#balance').evaluate(input => [input.min, input.max, input.step, input.value]), ['-3', '3', '1', '0']);
    await local.locator('#balance').fill('-3'); await local.locator('#balance').focus();
    for (let position = -3; position <= 3; position++) {
      if (position > -3) await local.keyboard.press('ArrowRight');
      assert.deepEqual((await state(local)).assists, [Math.max(0, -position), Math.max(0, position)]);
    }
    await local.locator('#balance').fill('-1');
    await local.selectOption('#pitch', '6'); await local.fill('#target-score', '1');
    await local.screenshot({ path: 'evidence/players-and-assistance.png', fullPage: true });
    await local.click('#start'); assert.deepEqual((await state(local)).assists, [1, 0]);
    assert.equal(await local.evaluate(() => sportheads.engine.game_body_count()), 23);
    assert.ok(await local.evaluate(() => {
      const surface = document.querySelector('#game-surface').getBoundingClientRect();
      const canvas = document.querySelector('#field').getBoundingClientRect();
      const dock = document.querySelector('.ground-bar').getBoundingClientRect();
      return dock.top >= canvas.top + canvas.width * .6 - 1 && dock.bottom <= surface.bottom + 1
        && [...document.querySelectorAll('button,input,select')].every(control => control.closest('.arena'));
    }), 'controls belong to the arena and the toolbar occupies the below-ground band');
    assert.equal(await local.locator('#balance').isEnabled(), false);

    await finish(local); await local.click('#again');
    assert.deepEqual((await state(local)).assists, [1, 0]);
    await local.setViewportSize({ width: 390, height: 844 });
    assert.ok(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const host = await pageAt(); await host.click('#play-online');
    await host.locator('#balance').fill('3'); await host.selectOption('#pitch', '3');
    await host.fill('#target-score', '1'); await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await guest.waitForFunction(() => sportheads.snapshot().connected && document.querySelector('#balance').value === '3');
    assert.equal(await guest.locator('#balance').isEnabled(), false);

    await guest.selectOption('#skin-right', '12');
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '12');
    await host.click('#start'); await guest.waitForFunction(() => sportheads.snapshot().started);
    assert.deepEqual((await state(guest)).assists, [0, 3]);
    assert.deepEqual((await state(host)).assists, [0, 3]);
    await finish(host); await guest.waitForFunction(() => sportheads.snapshot().phase === 3);
    assert.deepEqual((await state(guest)).assists, [0, 3]);
    await host.click('#play-view'); await host.locator('#balance').fill('-2'); await host.click('#close-settings'); await host.click('#again');
    await guest.waitForFunction(() => sportheads.snapshot().matchId === 2 && sportheads.snapshot().assists[0] === 2);
    assert.deepEqual((await state(host)).assists, [2, 0]);
    assert.deepEqual((await state(guest)).assists, [2, 0]);
    await host.click('#play-view'); await host.click('#leave-room');
    await guest.waitForFunction(() => !sportheads.snapshot().connected);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['simple matches only', '19 pitches', '12 distinct modern transparent portraits', 'neutral default', 'seven-position keyboard slider', 'in-game settings and below-ground toolbar', 'locked match settings', 'replay retains choice', 'real WebRTC assistance sharing', 'host owns handicap', 'modern guest player selection', 'mobile layout'] }));
  } catch (error) {
    for (const [index, page] of pages.entries()) if (!page.isClosed()) {
      console.error(index, await state(page).catch(() => null));
      await page.screenshot({ path: `evidence/setup-failure-${index}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
