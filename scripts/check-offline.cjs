// Installable offline game, plus the fallbacks for older browsers in compat.js.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const url = process.argv[2]; assert.ok(url, 'Usage: node scripts/check-offline.cjs URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  async function pageAt(context) {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
    return page;
  }
  try {
    const manifest = await (await fetch(new URL('manifest.webmanifest', url))).json();
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'), 'maskable icon');
    for (const icon of manifest.icons) assert.equal((await fetch(new URL(icon.src, url))).status, 200, icon.src);

    const context = await browser.newContext();
    let page = await pageAt(context);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload(); await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined, 'offline reload boots from the cache');
    await page.click('#play-ai'); await page.click('#setup-next');
    await goToSetup(page, 'rules'); await setTarget(page, 1);
    await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 10_000 });
    await page.click('#start'); await page.waitForFunction(() => sportheads.snapshot().phase === 1);
    await page.waitForFunction(() => sportheads.snapshot().tick > 30);
    await context.close();

    // Safari 15.0-15.3 lacks these built-ins; compat.js must fill them before the modules.
    const older = await browser.newContext();
    await older.addInitScript(() => { delete Object.hasOwn; delete Array.prototype.at; });
    page = await pageAt(older);
    assert.equal(await page.locator('.unsupported-browser').count(), 0);
    await older.close();

    const ancient = await browser.newContext();
    await ancient.addInitScript(() => { delete window.WebAssembly; });
    page = await ancient.newPage(); await page.goto(url);
    await page.locator('.unsupported-browser').waitFor();
    await ancient.close();

    assert.deepEqual(errors.filter(message => !/WebAssembly/.test(message)), []);
    console.log(JSON.stringify({ passed: true, checks: ['manifest icons', 'offline reload', 'offline match vs AI', 'Object.hasOwn and Array.at fallbacks', 'unsupported browser message'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
