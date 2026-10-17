const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const messages = [];
  const checkpoints = [];
  try {
    const page = await browser.newPage({ viewport: { width: 840, height: 610 } });
    page.on('console', m => messages.push({ type: m.type(), text: m.text() }));
    page.on('pageerror', e => messages.push({ type: 'pageerror', text: e.message }));
    await page.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:8765/probe/?file=instrumented');
    await page.waitForFunction(() => window.loaded || window.loadError, { timeout: 30000 });
    await page.waitForFunction(() => typeof window.player?.probeState === 'function', { timeout: 10000 });
    async function call(name, ...args) {
      return page.evaluate(({ name, args }) => window.player.ruffle().callExternalInterface(name, ...args), { name, args });
    }
    async function capture(name) {
      const state = await call('probeState');
      checkpoints.push({ name, state });
      console.log(name, JSON.stringify(state));
      await page.screenshot({ path: `evidence/oracle-${name}.png` });
      return state;
    }
    await page.waitForTimeout(1500);
    await capture('boot');
    await call('probeCall', 'gotoAndPlay', [3]);
    await page.waitForTimeout(1500);
    await call('probeCall', 'gotoAndStop', ['menu']);
    await page.waitForTimeout(500);
    await capture('menu');
    await call('probeCall', 'new2PlayerGame', []);
    await page.waitForTimeout(700);
    await capture('briefing');
    await page.locator('ruffle-player').click({ position: { x: 400, y: 270 } });
    await page.keyboard.press('Space');
    await call('probeKeys', [32]);
    await page.waitForTimeout(150);
    await call('probeKeys', []);
    await page.waitForTimeout(4200);
    await capture('playing');
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    await capture('moved');
    await page.evaluate(() => window.player.ruffle().suspend());
    const before = await call('probeState');
    const after = await call('probeStep', [39], 15);
    checkpoints.push({ name: 'manual-steps', before, after });
    console.log('manual-steps', JSON.stringify({ before, after }));
    fs.writeFileSync('evidence/oracle-runtime.json', JSON.stringify({ checkpoints, messages, traces: await page.evaluate(() => window.traces) }, null, 2));
  } finally {
    fs.writeFileSync('evidence/oracle-console.json', JSON.stringify(messages, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
