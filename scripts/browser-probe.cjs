const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 840, height: 610 } });
    const messages = [];
    const blocked = [];
    page.on('console', m => messages.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', e => messages.push({ type: 'pageerror', text: e.message }));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
      blocked.push(url.origin + url.pathname);
      return route.abort();
    });
    await page.goto('http://127.0.0.1:8765/probe/' + (process.argv[2] || ''));
    await page.waitForFunction(() => window.loaded || window.loadError, { timeout: 30000 });
    await page.waitForTimeout(7000);
    await page.screenshot({ path: 'evidence/browser-start.png' });
    const state = await page.evaluate(() => ({
      loaded: window.loaded, error: window.loadError,
      metadata: window.player?.ruffle().metadata,
      traces: window.traces,
      body: document.body.innerText,
    }));
    fs.writeFileSync('evidence/browser-start.json', JSON.stringify({ state, messages, blocked }, null, 2));
    console.log(JSON.stringify({ ...state, messages: messages.length, blocked }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
