// Run against a packaged site or its deployed GitHub Pages URL.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const url = process.argv[2];
  assert.ok(url, 'Usage: node scripts/check-pages.cjs URL');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    assert.equal((await page.goto(url)).status(), 200);
    await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    assert.equal(await page.locator('#scene option').count(), 11);
    for (let i = 0; i < 11; i++) {
      await page.selectOption('#scene', String(i));
      await page.locator('#tick').evaluate(slider => {
        slider.value = slider.max;
        slider.dispatchEvent(new Event('input'));
      });
      assert.match(await page.locator('#position').innerText(), /Écart de position/);
      assert.ok(await page.locator('#flash').evaluate(canvas =>
        canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(v => v !== 0)));
    }
    await page.selectOption('#scene', '7');
    await page.click('#play');
    await page.waitForFunction(() => +document.querySelector('#tick').value > 1);
    await page.click('#play');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`PASS ${url}: 11 replays, playback, mobile layout, no failed requests`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
