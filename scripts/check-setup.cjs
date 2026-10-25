const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget, setBalance } = require('./setup-browser.cjs');
// Friends' caricatures are only listed with a group link.
const url = process.argv[2] && process.argv[2] + '?groupe=tout'; assert.ok(url, 'Usage: node scripts/check-setup.cjs URL [--local-only]');
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
  const waitStep = (page, step) => page.waitForFunction(step => sportheads.snapshot().setupStep === step, step);
  async function spamRandom(page, button, select, preview) {
    const before = await page.locator(select).inputValue();
    await page.click(button);
    assert.notEqual(await page.locator(select).inputValue(), before, 'random click immediately changes choice');
    return page.evaluate(({ button, select, preview }) => {
      const input = document.querySelector(select), image = document.querySelector(preview);
      for (let i = 0; i < 30; i++) {
        const previous = input.value, pixels = image.toDataURL();
        document.querySelector(button).click();
        if (input.value === previous || !input.selectedOptions.length) throw Error('Random click did not select another option');
        if (select === '#pitch') {
          if (document.querySelector('#pitch-caption').textContent !== input.selectedOptions[0].textContent) throw Error('Terrain caption lags behind random selection');
          if (sportheads.snapshot().pitch !== +input.value) throw Error('Selected terrain differs from match configuration');
        } else if (image.toDataURL() === pixels) throw Error('Portrait did not update immediately');
      }
      return input.value;
    }, { button, select, preview });
  }
  async function finish(page) {
    await page.evaluate(() => {
      const e = sportheads.engine; let ticks = 0;
      while (e.game_value(0) !== 3 && ticks++ < 40000) e.game_tick(ticks % 120 < 60 ? 2 | 16 | 8 | 128 : 4 | 64);
      if (e.game_value(0) !== 3) throw Error('Match did not finish'); sportheads.render();
    });
  }
  try {
    const local = await pageAt();
    assert.equal((await state(local)).setupStep, 'home');
    await local.screenshot({ path: 'evidence/setup-home.png' });
    assert.equal(await local.locator('#play-local').isVisible(), true);
    for (const id of ['player-choice', 'pitch', 'target-score', 'balance-controls', 'start']) assert.equal(await local.locator('#' + id).isVisible(), false, `home hides ${id}`);
    assert.equal(await local.locator('#competition,#best-of,#tournament-panel').count(), 0);
    await local.click('#play-local'); assert.equal((await state(local)).setupStep, 'players');
    assert.equal(await local.locator('#player-choice').isVisible(), true);
    assert.equal(await local.locator('#pitch').isVisible(), false);
    assert.equal(await local.locator('#skin-left option').count(), 14);
    assert.deepEqual((await state(local)).buffs, [[0,0,0,0,0],[0,0,0,0,0]]);
    const hashes = [];
    for (let skin = 13; skin <= 26; skin++) {
      await local.selectOption('#skin-left', String(skin));
      hashes.push(await local.evaluate(() => {
        const canvas = document.querySelector('#player-preview-0');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261, occupied = 0;
        for (let i = 0; i < pixels.length; i++) { hash = Math.imul(hash ^ pixels[i], 16777619); if (i % 4 === 3 && pixels[i]) occupied++; }
        if (occupied < canvas.width * canvas.height * .1 || occupied > canvas.width * canvas.height * .9) throw Error('Avatar empty or opaque rectangle');
        return hash;
      }));
    }
    assert.equal(new Set(hashes).size, 14);
    await spamRandom(local, '#random-player-0', '#skin-left', '#player-preview-0');
    await spamRandom(local, '#random-player-1', '#skin-right', '#player-preview-1');
    await local.selectOption('#skin-left', '13'); await local.selectOption('#skin-right', '14');
    await local.screenshot({ path: 'evidence/setup-players.png' });
    await local.click('#setup-next'); assert.equal((await state(local)).setupStep, 'pitch');
    assert.equal(await local.locator('#player-choice').isVisible(), false);
    assert.equal(await local.locator('#target-score').isVisible(), false);
    assert.deepEqual(await local.locator('#pitch option').evaluateAll(options => options.map(option => +option.value)), [2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 15, 16, 17, 18]);
    await spamRandom(local, '#random-pitch', '#pitch', '#pitch-preview');
    await local.selectOption('#pitch', '6'); await local.screenshot({ path: 'evidence/setup-pitch.png' });
    await local.click('#setup-next'); assert.equal((await state(local)).setupStep, 'rules');
    assert.equal(await local.locator('#pitch').isVisible(), false);
    assert.equal(await local.locator('#start').isVisible(), true);
    assert.equal(await local.locator('#target-score').inputValue(), '7');
    assert.equal(await local.locator('#target-score').evaluate(input => input.readOnly), true);
    await setTarget(local, 9); assert.equal(await local.locator('#goal-plus').isEnabled(), false);
    await local.evaluate(() => document.querySelector('#goal-plus').click());
    assert.equal(await local.locator('#target-score').inputValue(), '9');
    await setTarget(local, 1); assert.equal(await local.locator('#goal-minus').isEnabled(), false);
    await local.evaluate(() => document.querySelector('#goal-minus').click());
    assert.equal(await local.locator('#target-score').inputValue(), '1');
    assert.equal(await local.locator('#balance').count(), 0);
    for (const preset of ['normal','superman','blue','red']) {
      for (const amount of (['blue','red'].includes(preset) ? [10,30,50] : [30])) {
        await setBalance(local,preset,amount);
        const expected = [0,1].map(side => Array(5).fill(preset==='superman'?30:preset===(side===0?'blue':'red')?amount:0));
        assert.deepEqual((await state(local)).buffs,expected);
      }
    }
    await setBalance(local,'blue',10); await setTarget(local,1);
    await local.screenshot({ path: 'evidence/setup-rules.png' });
    await goToSetup(local, 'players'); await goToSetup(local, 'rules');
    assert.equal(await local.locator('#target-score').inputValue(), '1');
    assert.equal((await state(local)).balance.preset, 'blue');
    await local.click('#start'); assert.deepEqual((await state(local)).buffs, [[10,10,10,10,10],[0,0,0,0,0]]);
    assert.equal(await local.evaluate(() => sportheads.engine.game_body_count()), 25);
    assert.equal(await local.locator('[data-balance-preset=manual]').isEnabled(), false);
    assert.ok(await local.evaluate(() => {
      const surface = document.querySelector('#game-surface').getBoundingClientRect();
      const canvas = document.querySelector('#field').getBoundingClientRect();
      const dock = document.querySelector('.ground-bar').getBoundingClientRect();
      return Math.abs(surface.height - canvas.height) < 1 && (!dock.height || dock.top >= canvas.bottom - 1)
        && [...document.querySelectorAll('button,input,select')].every(control => control.closest('.arena'));
    }));
    await finish(local); await local.click('#again'); assert.deepEqual((await state(local)).buffs, [[10,10,10,10,10],[0,0,0,0,0]]);
    await local.setViewportSize({ width: 390, height: 844 });
    assert.ok(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    if (process.argv.includes('--local-only')) {
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ passed: true, localOnly: true, checks: ['home and preparation navigation', '14 distinct group portraits', 'random characters and pitches', 'goal bounds 1..9', 'balance presets', 'configuration survives navigation and replay'] }));
      return;
    }
    const host = await pageAt(); await host.click('#play-online');
    assert.equal((await state(host)).setupStep, 'room');
    assert.equal(await host.locator('#player-choice').isVisible(), false);
    await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]$/.test(document.querySelector('#room-code').textContent));
    assert.equal(await host.locator('#random-player-1').isEnabled(), false);
    await spamRandom(host, '#random-player-0', '#skin-left', '#player-preview-0');
    await goToSetup(host, 'pitch'); await host.selectOption('#pitch', '3');
    const share = new URL(url); share.searchParams.set('room', await host.locator('#room-code').innerText());
    const guest = await pageAt(share.href); await guest.click('#join-room');
    await guest.waitForFunction(() => sportheads.snapshot().connected); await waitStep(guest, 'pitch');
    assert.equal(await guest.locator('#pitch').inputValue(), '3', 'late join receives current terrain');
    assert.equal(await guest.locator('#pitch').isEnabled(), false);
    assert.equal(await guest.locator('#random-pitch').isEnabled(), false);
    const guestPitch = await guest.locator('#pitch').inputValue();
    await guest.evaluate(() => document.querySelector('#random-pitch').dispatchEvent(new MouseEvent('click')));
    assert.equal(await guest.locator('#pitch').inputValue(), guestPitch, 'read-only random handler rejects synthetic clicks');
    assert.equal(await guest.locator('#skin-right').isVisible(), true);
    assert.equal(await guest.locator('#skin-right').isEnabled(), true);
    assert.equal(await guest.locator('#setup-next').isVisible(), false);
    assert.equal(await guest.locator('#setup-back').isVisible(), false);
    const randomRed = await spamRandom(guest, '#random-player-1', '#skin-right', '#player-preview-1');
    await host.waitForFunction(value => document.querySelector('#skin-right').value === value, randomRed);
    const randomPitch = await spamRandom(host, '#random-pitch', '#pitch', '#pitch-preview');
    await guest.waitForFunction(value => document.querySelector('#pitch').value === value && document.querySelector('#pitch-caption').textContent === document.querySelector('#pitch').selectedOptions[0].textContent, randomPitch);
    await guest.selectOption('#skin-right', '26');
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '26');
    await host.selectOption('#pitch', '6'); await guest.waitForFunction(() => document.querySelector('#pitch').value === '6');
    await guest.screenshot({ path: 'evidence/setup-online-guest-pitch.png' });
    await goToSetup(host, 'players'); await waitStep(guest, 'players');
    assert.equal(await guest.locator('#skin-left').isEnabled(), false);
    assert.equal(await guest.locator('#random-player-0').isEnabled(), false);
    assert.equal(await guest.locator('#skin-right').inputValue(), '26');
    await goToSetup(host, 'rules'); await waitStep(guest, 'rules');
    await setBalance(host,'red',50); await setTarget(host, 1); await host.locator('#bonuses').selectOption('0');
    await guest.waitForFunction(() => sportheads.snapshot().balance.preset === 'red' && sportheads.snapshot().balance.amount === 50 && document.querySelector('#target-score').value === '1' && document.querySelector('#bonuses').value === '0');
    assert.equal(await guest.locator('.balance-details').isVisible(), false);
    assert.equal(await guest.locator('#balance-amount').inputValue(), '2');
    assert.equal(await guest.locator('#balance-amount').getAttribute('aria-valuetext'), 'Beaucoup');
    assert.equal(await guest.locator('#balance-amount').isEnabled(), false);
    for (const id of ['goal-minus', 'goal-plus']) assert.equal(await guest.locator('#' + id).isEnabled(), false);
    await guest.evaluate(() => document.querySelector('#goal-plus').dispatchEvent(new MouseEvent('click')));
    assert.equal(await guest.locator('#target-score').inputValue(), '1');
    for (const id of ['buff-jump', 'target-score', 'bonuses', 'pitch']) assert.equal(await guest.locator('#' + id).isEnabled(), false, `${id} is read only`);
    assert.equal(await guest.locator('#start').isVisible(), false);
    await guest.evaluate(() => document.querySelector('#setup-next').click()); assert.equal((await state(host)).setupStep, 'rules');
    await guest.screenshot({ path: 'evidence/setup-online-guest-rules.png' });
    // A temporarily invalid target must not block shared navigation.
    await host.evaluate(() => { const input = document.querySelector('#target-score'); input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await goToSetup(host, 'pitch'); await waitStep(guest, 'pitch');
    await goToSetup(host, 'rules'); await setTarget(host, 1); await waitStep(guest, 'rules');
    // Simulate a still-open older guest without changing the room transport.
    await guest.evaluate(async () => {
      const source = new URL(document.querySelector('script[type="module"]').src); source.pathname = source.pathname.replace('game.js', 'rooms.js');
      const { Room } = await import(source.href), send = Room.prototype.send;
      Room.prototype.send = function (message, options) {
        if (message.type === 'input') {
          message = { ...message };
          if (window.legacyPitchInput) delete message.pitchGeometry;
          if (window.legacyAssistInput) delete message.statBuffs;
          if (window.legacyBonusPitchInput) delete message.bonusPitches;
        }
        return send.call(this, message, options);
      };
      window.legacyPitchInput = true;
    });
    await host.waitForFunction(() => document.querySelector('#start').disabled && document.querySelector('#start').textContent.includes('actualiser'));
    await guest.evaluate(() => { window.legacyPitchInput = false; });
    await host.waitForFunction(() => !document.querySelector('#start').disabled);
    await guest.evaluate(() => { window.legacyAssistInput = true; });
    await host.waitForFunction(() => document.querySelector('#start').disabled && document.querySelector('#start').textContent.includes('actualiser'));
    await guest.evaluate(() => { window.legacyAssistInput = false; });
    await host.waitForFunction(() => !document.querySelector('#start').disabled);
    // Opt-in layouts, live previews and the checkbox share the host's ownership.
    await goToSetup(host,'pitch'); await waitStep(guest,'pitch'); await host.check('#bonus-pitches');
    for(const [id,name] of [[21,'Flipper'],[24,'Ricochets'],[25,'Plafond bas'],[26,'Le diamant']]) {
      await host.selectOption('#pitch',String(id));
      await guest.waitForFunction(({id,name})=>document.querySelector('#bonus-pitches').checked
        && document.querySelector('#pitch').value===String(id) && document.querySelector('#pitch-caption').textContent===name,{id,name});
    }
    assert.equal(await guest.locator('#bonus-pitches').isEnabled(),false);
    assert.equal(await guest.locator('#pitch option').count(),18);
    await goToSetup(host,'rules'); await guest.evaluate(()=>{window.legacyBonusPitchInput=true;});
    await host.waitForFunction(()=>document.querySelector('#start').disabled && document.querySelector('#start').textContent.includes('actualiser'));
    await guest.waitForFunction(()=>sportheads.snapshot().pitch===8);
    assert.equal((await state(host)).pitch,26,'compatibility projection cannot mutate the host choice');
    await guest.evaluate(()=>{window.legacyBonusPitchInput=false;});
    await host.waitForFunction(()=>!document.querySelector('#start').disabled);
    await guest.waitForFunction(()=>sportheads.snapshot().pitch===26);
    await goToSetup(host,'pitch'); await host.uncheck('#bonus-pitches');
    await guest.waitForFunction(()=>!document.querySelector('#bonus-pitches').checked && document.querySelector('#pitch').value==='8');
    assert.equal(await guest.locator('#pitch option').count(),14);
    await host.selectOption('#pitch','6'); await goToSetup(host,'rules');
    // A newer guest follows an older host's original geometry in both previews
    // and the match renderer, instead of silently drawing the corrected variant.
    await host.evaluate(async () => {
      const source = new URL(document.querySelector('script[type="module"]').src); source.pathname = source.pathname.replace('game.js', 'rooms.js');
      const { Room } = await import(source.href), send = Room.prototype.send;
      Room.prototype.send = function (message, options) {
        if (window.legacyPitchFrames && message.type === 'frame') { message = { ...message }; delete message.pitchGeometry; }
        return send.call(this, message, options);
      };
      window.legacyPitchFrames = true;
    });
    await guest.waitForFunction(() => sportheads.renderState().balancedPitches === false);
    await host.evaluate(() => { window.legacyPitchFrames = false; });
    await guest.waitForFunction(() => sportheads.renderState().balancedPitches === true);
    await host.click('#start'); await guest.waitForFunction(() => sportheads.snapshot().started);
    assert.deepEqual((await state(guest)).buffs, [[0,0,0,0,0],[50,50,50,50,50]]);
    await finish(host); await guest.waitForFunction(() => sportheads.snapshot().phase === 3);
    await host.click('#play-view'); await setBalance(host,'blue',30); await host.click('#close-settings'); await host.click('#again');
    await guest.waitForFunction(() => sportheads.snapshot().matchId === 2 && sportheads.snapshot().buffs[0][0] === 30);
    assert.deepEqual((await state(host)).buffs, [[30,30,30,30,30],[0,0,0,0,0]]);
    await host.click('#play-view'); await host.click('#quit-match-settings'); await guest.waitForFunction(() => !sportheads.snapshot().connected);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['mode menu', 'players then pitch then rules', 'back navigation preserves choices', '14 distinct group portraits', '14 symmetric terrains', 'repeatable random choices with immediate previews', 'random selections sync with room permissions', 'independent per-stat buffs and preset buttons', 'in-game toolbar', 'late guest follows host screen', 'live terrain and rules in read-only mode', 'guest alone owns red avatar', 'guest cannot navigate host steps', 'invalid input does not block screen sync', 'older guest must refresh before corrected pitch', 'four opt-in pitches sync read-only, old guests refresh, disabling falls back to open pitch', 'older host retains original rendering', 'replay', 'mobile layout'] }));
  } catch (error) {
    for (const [index, page] of pages.entries()) if (!page.isClosed()) {
      console.error(index, await state(page).catch(() => null));
      await page.screenshot({ path: `evidence/setup-failure-${index}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
