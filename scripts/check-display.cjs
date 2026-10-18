const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-display.cjs URL');
(async () => {
  const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const safari = await webkit.launch({ headless: true });
  const errors = [];
  async function pageAt(browser, mobile, unsupported = false, standalone = false) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, isMobile: mobile, hasTouch: mobile });
    if (unsupported) await context.addInitScript(standalone => {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined });
      Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { value: undefined });
      Object.defineProperty(navigator, 'standalone', { value: standalone });
    }, standalone);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (browser === chrome) await (await context.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  async function fit(page) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const field = document.querySelector('#field'), r = field.getBoundingClientRect();
      const surface = document.querySelector('#game-surface').getBoundingClientRect();
      const score = document.querySelector('.scoreboard'), s = score.getBoundingClientRect();
      const bar = getComputedStyle(document.querySelector('.match-bar'));
      const buttons = [...document.querySelectorAll('.match-bar button,.touch-pad button')].filter(b => b.getClientRects().length).map(b => ({ id: b.id || b.getAttribute('aria-label'), tool: !!b.closest('.match-bar'), r: b.getBoundingClientRect().toJSON() }));
      const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
      return {
        crop: field.height === 480 && Math.abs(r.width / r.height - 800 / 480) < .001 && Math.abs(surface.height - r.height) < .5,
        score: s.top >= r.top && s.bottom < r.bottom && getComputedStyle(score).pointerEvents === 'none' && +getComputedStyle(score).opacity <= .65,
        transparent: bar.backgroundColor === 'rgba(0, 0, 0, 0)' && bar.pointerEvents === 'none',
        bounds: buttons.every(({ r }) => r.width >= 44 && r.height >= 44 && r.left >= -.5 && r.top >= -.5 && r.right <= innerWidth + .5 && r.bottom <= innerHeight + .5),
        disjoint: buttons.every((a, index) => buttons.every((b, other) => index === other || !overlaps(a.r, b.r))),
        lateral: innerWidth <= innerHeight || buttons.filter(b => b.tool).every(b => b.r.right <= r.left + .5 || b.r.left >= r.right - .5),
        dock: innerWidth <= innerHeight || document.querySelector('.ground-bar').getBoundingClientRect().height === 0,
        overflow: document.documentElement.scrollWidth <= innerWidth,
        field: r.toJSON(), buttons
      };
    });
    for (const name of ['crop', 'score', 'transparent', 'bounds', 'disjoint', 'lateral', 'dock', 'overflow']) assert.equal(result[name], true, name + ': ' + JSON.stringify(result));
    return result;
  }
  try {
    for (const browser of [chrome, safari]) {
      const page = await pageAt(browser, true);
      for (const mode of ['local', 'ai']) {
        await page.click('#play-' + mode);
        if (mode === 'ai') await page.click('#setup-next');
        await goToSetup(page, 'rules'); await page.selectOption('#bonuses', '0'); await page.click('#start');
        for (const layout of ['thumbs', 'three-fingers']) {
          await page.click('#play-view');
          for (const selector of ['#setup-steps','#setup-navigation','#online-panel','#player-choice','#performance-diagnostic','.rules-screen .launch','[data-setup-screen=home]','[data-setup-screen=difficulty]','[data-setup-screen=pitch]']) {
            assert.equal(await page.locator(selector).isVisible(),false,`match settings hide ${selector}`);
          }
          for (const selector of ['[data-setup-screen=rules]','#target-score','#balance-controls','#quit-match-settings','#fullscreen-settings','#close-settings','#touch-settings']) {
            assert.equal(await page.locator(selector).isVisible(),true,`match settings keep ${selector}`);
          }
          await page.screenshot({path:`evidence/match-settings-${browser===chrome?'chrome':'webkit'}-${mode}.png`});
          if (!await page.locator('#touch-layout').isVisible()) await page.click('#touch-settings summary');
          await page.selectOption('#touch-layout', layout); await page.click('#close-settings');
          if (await page.locator('#resume').isVisible()) await page.click('#resume');
          for (const [width, height] of [[320, 568], [390, 844], [844, 390], [740, 320]]) {
            await page.setViewportSize({ width, height }); const result = await fit(page);
            if (mode === 'ai' && width === 844) assert.ok(result.field.width >= 579, 'single player uses the narrower kick gutter');
            await page.screenshot({ path: `evidence/display-${browser === chrome ? 'chrome' : 'webkit'}-${mode}-${layout}-${width}.png` });
          }
        }
        await page.click('#play-view'); await page.click('#quit-match-settings');
        assert.equal(await page.locator('#play-local').isVisible(),true);
        assert.equal(await page.locator('#performance-diagnostic').isVisible(),true,'preparation retains its help sections');
      }
      await page.context().close();
    }
    const desktop = await pageAt(chrome, false);
    await desktop.click('#play-local'); await goToSetup(desktop, 'rules'); await desktop.click('#start');
    await fit(desktop);
    assert.equal(await desktop.locator('.ground-bar').isVisible(), false);
    await desktop.click('#fullscreen');
    await desktop.waitForFunction(() => document.fullscreenElement === document.querySelector('.arena') && document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'true');
    assert.equal(await desktop.locator('#fullscreen').getAttribute('aria-pressed'), 'true');
    await fit(desktop);
    await desktop.click('#play-view'); await desktop.click('#fullscreen-settings');
    await desktop.waitForFunction(() => !document.fullscreenElement && document.querySelector('#fullscreen').getAttribute('aria-pressed') === 'false');
    assert.equal(await desktop.locator('#fullscreen').getAttribute('aria-pressed'), 'false');
    await desktop.click('#fullscreen-settings'); await desktop.waitForFunction(() => !!document.fullscreenElement);
    await desktop.evaluate(() => document.exitFullscreen());
    await desktop.waitForFunction(() => !document.fullscreenElement && document.querySelector('#fullscreen-settings').textContent === 'Plein écran');
    assert.equal(await desktop.locator('#fullscreen-settings').innerText(), 'Plein écran');
    await desktop.context().close();
    const unsupported = await pageAt(chrome, true, true);
    await unsupported.click('#fullscreen-settings');
    assert.equal(await unsupported.locator('#fullscreen').isVisible(), false);
    assert.equal(await unsupported.locator('#fullscreen-settings').innerText(), 'Jouer sans barre d’adresse');
    assert.match(await unsupported.locator('#fullscreen-status').innerText(), /écran d’accueil/);
    assert.match(await unsupported.locator('#fullscreen-status').innerText(), /Ouvrir comme app web/);
    const manifest = await unsupported.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    const installed = await pageAt(chrome, true, true, true);
    assert.equal(await installed.locator('#fullscreen-settings').innerText(), 'Ouvert depuis l’écran d’accueil');
    assert.equal(await installed.locator('#fullscreen-settings').isDisabled(), true);
    assert.equal(await installed.locator('#fullscreen-status').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['800x480 crop without empty bars', 'small transparent score overlay', 'side tools in landscape', 'no overlap with either touch layout', 'local and AI on Chrome/WebKit mobile 320/390/740/844', 'real fullscreen enter/exit and external exit', 'unsupported-browser guidance and standalone manifest'] }));
  } finally { await Promise.all([chrome.close(), safari.close()]); }
})().catch(e => { console.error(e); process.exitCode = 1; });
