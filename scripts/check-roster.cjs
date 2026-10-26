// Short, data-driven checks for cosmetic roster releases. No AI/network scenarios.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/check-roster.cjs URL');

(async () => {
  const { PLAYER_COUNT, PLAYER_NAMES } = await import('../web/players.js');
  const { GROUPS, PUBLIC_IDS, unlockedIds } = await import('../web/roster-access.js');
  for (const type of [chromium, webkit]) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const hashes = new Set();
      for (const group of ['aucun', ...Object.keys(GROUPS)]) {
        await page.goto(url + '?groupe=' + group);
        await page.waitForFunction(() => window.ready || window.loadError);
        assert.equal(await page.evaluate(() => window.loadError), undefined);
        await page.click('#play-local');
        const expected = [...(group === 'aucun' ? PUBLIC_IDS : unlockedIds([group]))].sort((a, b) => a - b);
        assert.deepEqual(await page.locator('.character-tile:visible').evaluateAll(tiles => tiles.map(tile => +tile.dataset.character)), expected, group);
        assert.deepEqual(await page.locator('#skin-left option').evaluateAll(options => options.map(option => +option.value)), expected, group);
        // Select and inspect every portrait, including future additions.
        for (const skin of expected) {
          await page.selectOption('#skin-left', String(skin));
          assert.equal(await page.locator('#fighter-name-0').innerText(), PLAYER_NAMES[skin - 1]);
          assert.equal(await page.evaluate(() => sportheads.renderState().skins[0]), skin);
          const hash = await page.locator('#player-preview-0').evaluate(canvas => {
            const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261, occupied = 0;
            for (let i = 0; i < pixels.length; i++) {
              hash = Math.imul(hash ^ pixels[i], 16777619);
              if (i % 4 === 3 && pixels[i]) occupied++;
            }
            if (occupied < canvas.width * canvas.height * .1 || occupied > canvas.width * canvas.height * .9) throw Error('Portrait empty or opaque');
            return hash;
          });
          hashes.add(hash);
        }
        for (const side of [0, 1]) {
          await page.click('#random-player-' + side);
          assert.ok(expected.includes((await page.evaluate(() => sportheads.renderState().skins))[side]), 'random stays in ' + group);
        }
      }
      assert.equal(hashes.size, PLAYER_COUNT, 'every portrait is distinct');
      const skins = await page.evaluate(() => sportheads.renderState().skins);
      await page.click('#setup-next'); await page.click('#setup-next'); await page.click('#start');
      assert.equal(await page.evaluate(() => sportheads.snapshot().started), true);
      assert.deepEqual(await page.evaluate(() => sportheads.renderState().skins), skins, 'chosen portraits reach the match');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ browser: type.name(), passed: true, portraits: PLAYER_COUNT, groups: Object.keys(GROUPS).length }));
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
