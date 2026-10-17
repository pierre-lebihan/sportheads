const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-competition.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(target = url) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(target); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined); return page;
  }
  const snapshot = page => page.evaluate(() => sportheads.snapshot());
  async function finish(page) {
    return page.evaluate(() => {
      const e = sportheads.engine; let ticks = 0;
      while (e.game_value(0) !== 3 && ticks < 40000) { e.game_tick(ticks % 120 < 60 ? 2 | 16 | 8 | 128 : 4 | 64); ticks++; }
      if (e.game_value(0) !== 3) throw Error('Real match did not finish in 40000 ticks');
      sportheads.render(); return sportheads.snapshot();
    });
  }
  try {
    const local = await pageAt();
    assert.equal(await local.locator('#pitch option').count(), 19);
    assert.equal(await local.locator('#skin-left option').count(), 26);
    assert.equal(await local.locator('#skin-left option').first().innerText(), 'Tchéquie');
    await local.selectOption('#pitch', '6'); await local.fill('#target-score', '1');
    await local.selectOption('#skin-left', '14'); await local.selectOption('#skin-right', '25');
    await local.click('#start');
    assert.equal((await snapshot(local)).pitch, 6);
    assert.equal(await local.evaluate(() => sportheads.engine.game_body_count()), 23);
    assert.equal(await local.locator('#pitch').isEnabled(), false);
    await local.screenshot({ path: 'evidence/pitch-six.png', fullPage: true });
    await local.click('#play-online'); await local.click('#play-local');
    await local.selectOption('#pitch', '8');
    for (const count of [4, 8]) {
      await local.selectOption('#competition', 'bracket' + count);
      assert.equal(await local.locator('#tournament-setup').isVisible(), true);
      assert.equal(await local.locator('#entrant-fields input').count(), count);
      await local.locator('#entrant-fields input').first().fill('');
      await local.click('#start'); assert.equal(await local.locator('#competition-error').isVisible(), true);
      for (let i = 0; i < count; i++) await local.locator('#entrant-fields input').nth(i).fill(`Participant ${i + 1}`);
      await local.click('#start');
      for (let game = 0; game < count - 1; game++) {
        const start = await snapshot(local); assert.equal(start.tournament.records.length, game);
        assert.equal(await local.locator('#competition').isEnabled(), false);
        assert.equal(await local.locator('#skin-left').isEnabled(), false);
        const result = await finish(local);
        assert.equal(result.tournament.records.length, game + 1);
        if (game < count - 2) { assert.equal(result.tournament.champion, null); await local.click('#again'); }
        else assert.ok(Number.isInteger(result.tournament.champion));
      }
      assert.equal(await local.locator('#tournament-results li').count(), count - 1);
      assert.match(await local.locator('#tournament-status').innerText(), /remporte/);
      await local.screenshot({ path: `evidence/tournament-${count}.png`, fullPage: true });
      await local.setViewportSize({ width: 390, height: 844 });
      assert.ok(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await local.screenshot({ path: `evidence/tournament-${count}-mobile.png`, fullPage: true });
      await local.setViewportSize({ width: 1280, height: 1100 });
      if (count === 8) {
        await local.click('#cancel-tournament');
        assert.equal((await snapshot(local)).tournament, null);
      }
    }
    // The remote cup keeps the two connected humans, and sends every result.
    const host = await pageAt(); await host.click('#play-online');
    await host.fill('#target-score', '1'); await host.selectOption('#pitch', '3');
    await host.selectOption('#competition', 'series'); await host.selectOption('#best-of', '3');
    assert.equal(await host.locator('#competition option[value="bracket4"]').evaluate(option => option.disabled), true);
    await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await guest.waitForFunction(() => sportheads.snapshot().connected);
    await guest.waitForFunction(() => document.querySelector('#pitch').value === '3' && document.querySelector('#competition').value === 'series');
    assert.equal(await guest.locator('#pitch').isEnabled(), false);
    await host.click('#start'); await guest.waitForFunction(() => sportheads.snapshot().started);
    assert.equal((await snapshot(guest)).pitch, 3);
    let games = 0;
    while ((await snapshot(host)).tournament.champion === null && games < 3) {
      const result = await finish(host); games++;
      await guest.waitForFunction(length => sportheads.snapshot().tournament?.records.length === length, games);
      assert.deepEqual((await snapshot(guest)).tournament, result.tournament);
      if (result.tournament.champion === null) {
        await host.click('#again');
        await guest.waitForFunction(id => sportheads.snapshot().matchId === id && sportheads.snapshot().phase === 0, (await snapshot(host)).matchId);
      }
    }
    const champion = (await snapshot(host)).tournament.champion;
    assert.ok(Number.isInteger(champion)); assert.ok(games >= 2 && games <= 3);
    assert.equal((await snapshot(guest)).tournament.champion, champion);
    await guest.waitForFunction(() => document.querySelector('#result').textContent.includes('remporte la coupe')); 
    await guest.screenshot({ path: 'evidence/online-cup.png', fullPage: true });
    await host.click('#cancel-tournament'); await guest.waitForFunction(() => sportheads.snapshot().tournament === null && !sportheads.snapshot().started);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['26 named player previews', '19 selectable physical pitches', 'locked shared settings', '4-player bracket through final', '8-player bracket through final', 'mobile brackets', 'actual remote cup through champion', 'shared pitch and history', 'return to lobby'], remoteCupMatches: games }));
  } catch (error) {
    for (const [i, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      console.error(i, await page.evaluate(() => ({ state: window.sportheads?.snapshot(), error: document.querySelector('#competition-error')?.textContent, room: document.querySelector('#room-status')?.textContent })).catch(() => 'closed'));
      await page.screenshot({ path: `evidence/competition-failure-${i}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
