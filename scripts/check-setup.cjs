const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
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
    for (const id of ['player-choice', 'pitch', 'target-score', 'balance', 'start']) assert.equal(await local.locator('#' + id).isVisible(), false, `home hides ${id}`);
    assert.equal(await local.locator('#competition,#best-of,#tournament-panel').count(), 0);
    await local.click('#play-local'); assert.equal((await state(local)).setupStep, 'players');
    assert.equal(await local.locator('#player-choice').isVisible(), true);
    assert.equal(await local.locator('#pitch').isVisible(), false);
    assert.equal(await local.locator('#skin-left option').count(), 19);
    assert.deepEqual((await state(local)).assists, [0, 0]);
    const hashes = [];
    for (let skin = 1; skin <= 19; skin++) {
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
    assert.equal(new Set(hashes).size, 19);
    await spamRandom(local, '#random-player-0', '#skin-left', '#player-preview-0');
    await spamRandom(local, '#random-player-1', '#skin-right', '#player-preview-1');
    await local.selectOption('#skin-left', '1'); await local.selectOption('#skin-right', '2');
    await local.screenshot({ path: 'evidence/setup-players.png' });
    await local.click('#setup-next'); assert.equal((await state(local)).setupStep, 'pitch');
    assert.equal(await local.locator('#player-choice').isVisible(), false);
    assert.equal(await local.locator('#target-score').isVisible(), false);
    assert.deepEqual(await local.locator('#pitch option').evaluateAll(options => options.map(option => +option.value)), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]);
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
    assert.equal(await local.locator('#assist-left,#assist-right').count(), 0);
    assert.deepEqual(await local.locator('#balance').evaluate(input => [input.min, input.max, input.step, input.value]), ['-5', '5', '1', '0']);
    await local.locator('#balance').fill('-5'); await local.locator('#balance').focus();
    for (let position = -5; position <= 5; position++) {
      if (position > -5) await local.keyboard.press('ArrowRight');
      assert.deepEqual((await state(local)).assists, [Math.max(0, -position), Math.max(0, position)]);
      if (Math.abs(position) >= 4) assert.match(await local.locator('#balance-status').innerText(), new RegExp(position === -5 || position === 5 ? '50' : '40'));
    }
    await local.locator('#balance').fill('-1'); await setTarget(local, 1);
    await local.screenshot({ path: 'evidence/setup-rules.png' });
    await goToSetup(local, 'players'); await goToSetup(local, 'rules');
    assert.equal(await local.locator('#target-score').inputValue(), '1');
    assert.equal(await local.locator('#balance').inputValue(), '-1');
    await local.click('#start'); assert.deepEqual((await state(local)).assists, [1, 0]);
    assert.equal(await local.evaluate(() => sportheads.engine.game_body_count()), 23);
    assert.equal(await local.locator('#balance').isEnabled(), false);
    assert.ok(await local.evaluate(() => {
      const surface = document.querySelector('#game-surface').getBoundingClientRect();
      const canvas = document.querySelector('#field').getBoundingClientRect();
      const dock = document.querySelector('.ground-bar').getBoundingClientRect();
      return Math.abs(surface.height - canvas.height) < 1 && (!dock.height || dock.top >= canvas.bottom - 1)
        && [...document.querySelectorAll('button,input,select')].every(control => control.closest('.arena'));
    }));
    await finish(local); await local.click('#again'); assert.deepEqual((await state(local)).assists, [1, 0]);
    await local.setViewportSize({ width: 390, height: 844 });
    assert.ok(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const host = await pageAt(); await host.click('#play-online');
    assert.equal((await state(host)).setupStep, 'room');
    assert.equal(await host.locator('#player-choice').isVisible(), false);
    await host.click('#create-room');
    await host.waitForFunction(() => /^[A-HJ-NP-Z2-9]{8}$/.test(document.querySelector('#room-code').textContent));
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
    await guest.selectOption('#skin-right', '12');
    await host.waitForFunction(() => document.querySelector('#skin-right').value === '12');
    await host.selectOption('#pitch', '6'); await guest.waitForFunction(() => document.querySelector('#pitch').value === '6');
    await guest.screenshot({ path: 'evidence/setup-online-guest-pitch.png' });
    await goToSetup(host, 'players'); await waitStep(guest, 'players');
    assert.equal(await guest.locator('#skin-left').isEnabled(), false);
    assert.equal(await guest.locator('#random-player-0').isEnabled(), false);
    assert.equal(await guest.locator('#skin-right').inputValue(), '12');
    await goToSetup(host, 'rules'); await waitStep(guest, 'rules');
    await host.locator('#balance').fill('5'); await setTarget(host, 1); await host.locator('#bonuses').uncheck();
    await guest.waitForFunction(() => document.querySelector('#balance').value === '5' && document.querySelector('#target-score').value === '1' && !document.querySelector('#bonuses').checked);
    assert.equal(await guest.locator('#balance-status').innerText(), 'Rouge +50 %');
    for (const id of ['goal-minus', 'goal-plus']) assert.equal(await guest.locator('#' + id).isEnabled(), false);
    await guest.evaluate(() => document.querySelector('#goal-plus').dispatchEvent(new MouseEvent('click')));
    assert.equal(await guest.locator('#target-score').inputValue(), '1');
    for (const id of ['balance', 'target-score', 'bonuses', 'pitch']) assert.equal(await guest.locator('#' + id).isEnabled(), false, `${id} is read only`);
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
          if (window.legacyAssistInput) delete message.extendedAssists;
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
    assert.deepEqual((await state(guest)).assists, [0, 5]);
    await finish(host); await guest.waitForFunction(() => sportheads.snapshot().phase === 3);
    await host.click('#play-view'); await host.locator('#balance').fill('-2'); await host.click('#close-settings'); await host.click('#again');
    await guest.waitForFunction(() => sportheads.snapshot().matchId === 2 && sportheads.snapshot().assists[0] === 2);
    assert.deepEqual((await state(host)).assists, [2, 0]);
    await host.click('#play-view'); await host.click('#leave-room'); await guest.waitForFunction(() => !sportheads.snapshot().connected);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, url, checks: ['mode menu', 'players then pitch then rules', 'back navigation preserves choices', '19 distinct portraits', '16 symmetric terrains', 'repeatable random choices with immediate previews', 'random selections sync with room permissions', 'eleven-position slider', 'in-game toolbar', 'late guest follows host screen', 'live terrain and rules in read-only mode', 'guest alone owns red avatar', 'guest cannot navigate host steps', 'invalid input does not block screen sync', 'older guest must refresh before corrected pitch', 'older host retains original rendering', 'replay', 'mobile layout'] }));
  } catch (error) {
    for (const [index, page] of pages.entries()) if (!page.isClosed()) {
      console.error(index, await state(page).catch(() => null));
      await page.screenshot({ path: `evidence/setup-failure-${index}.png`, fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
