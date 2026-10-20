// HD display: only the canvas backing store grows; the scene, its coordinates
// and the 30 Hz simulation are the same at every devicePixelRatio.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-hd.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(deviceScaleFactor, width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    await goToSetup(page, 'rules'); await setTarget(page, 9); await page.selectOption('#bonuses', '0');
    await page.waitForFunction(() => !document.querySelector('#start').disabled); await page.click('#start');
    await page.waitForFunction(() => sportheads.snapshot().phase === 1 && sportheads.snapshot().tick > 5);
    await page.click('#pause'); await page.waitForFunction(() => sportheads.snapshot().paused);
    return page;
  }
  // Each paused frame is compared on the base 800 x 480 grid.
  const frame = page => page.evaluate(() => {
    sportheads.render();
    const field = document.querySelector('#field'), small = document.createElement('canvas'); small.width = 800; small.height = 480;
    small.getContext('2d').drawImage(field, 0, 0, 800, 480);
    return { width: field.width, height: field.height, cssWidth: field.clientWidth,
      pixels: Array.from(small.getContext('2d').getImageData(0, 0, 800, 480).data) };
  });
  try {
    const base = await pageAt(1, 800), hd = await pageAt(2, 1280);
    const [a, b] = [await frame(base), await frame(hd)];
    assert.equal(a.width, 800, 'a small 1x field keeps the base resolution');
    assert.ok(b.width > 800 && b.width <= 1600 && b.height * 800 === b.width * 480, `HD backing store ${b.width}x${b.height}`);
    // Same scene geometry: the static arena (top band, stadium, goals) lines up pixel for pixel.
    let total = 0, count = 0;
    for (let y = 0; y < 200; y++) for (let x = 0; x < 800; x++) for (let c = 0; c < 3; c++) { total += Math.abs(a.pixels[(y * 800 + x) * 4 + c] - b.pixels[(y * 800 + x) * 4 + c]); count++; }
    assert.ok(total / count < 6, `HD frame matches the base frame once scaled down (mean difference ${(total / count).toFixed(2)})`);
    // The engine is untouched: same tick rate and body coordinates regardless of resolution.
    const ticks = await Promise.all([base, hd].map(async page => {
      await page.click('#resume'); const start = await page.evaluate(() => sportheads.snapshot().tick);
      await page.waitForTimeout(2000); return (await page.evaluate(() => sportheads.snapshot().tick)) - start;
    }));
    for (const count of ticks) assert.ok(count >= 50 && count <= 70, `30 Hz simulation at every resolution (${ticks})`);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, backingStore: [b.width, b.height], meanDifference: +(total / count).toFixed(2), ticksIn2s: ticks }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
