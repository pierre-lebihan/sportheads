// Adapter for the existing standalone checks: use the pinned Chromium build
// instead of system Chrome, and capture the still-open pages before cleanup.
const fs = require('node:fs/promises');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = process.env.SPORTHEADS_BROWSER_ARTIFACTS;
let sequence = 0;

for (const type of [playwright.chromium, playwright.webkit]) {
  const launch = type.launch.bind(type);
  type.launch = async (options = {}) => {
    if (type === playwright.chromium) {
      options = { ...options };
      delete options.channel;
    }
    const browser = await launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const context = await newContext(...args);
      context.on('page', page => {
        page.on('pageerror', error => {
          console.error(`[${type.name()} pageerror] ${error.stack || error}`);
          process.exitCode = 1;
        });
      });
      return context;
    };
    const close = browser.close.bind(browser);
    browser.close = async (...args) => {
      if (directory) {
        await fs.mkdir(directory, { recursive: true });
        for (const context of browser.contexts()) for (const page of context.pages()) {
          const name = `${type.name()}-${++sequence}`;
          try {
            await page.screenshot({ path: path.join(directory, `${name}.png`), timeout: 5000 });
            const state = await page.evaluate(() => ({
              url: location.href, ready: window.ready, loadError: window.loadError,
              snapshot: window.sportheads?.snapshot(),
            }));
            await fs.writeFile(path.join(directory, `${name}.json`), JSON.stringify(state, null, 2));
          } catch (error) {
            console.error(`[diagnostic ${name}] ${error.message}`);
          }
        }
      }
      return close(...args);
    };
    return browser;
  };
}
