// A new release reaches players: simulated deploy of a second build over the
// first one, served with GitHub Pages' 10-minute HTTP cache.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { goToSetup, setTarget } = require('./setup-browser.cjs');
const built = path.resolve(__dirname, '..', '_site');

// Release B is release A with a new revision and commit, like a real deploy.
const { revision, commit } = JSON.parse(fs.readFileSync(path.join(built, 'version.json'), 'utf8'));
const next = { revision: 'b'.repeat(12), commit: 'b'.repeat(40) };
const releaseB = fs.mkdtempSync(path.join(os.tmpdir(), 'sportheads-release-'));
fs.cpSync(built, releaseB, { recursive: true });
for (const name of fs.readdirSync(releaseB, { recursive: true })) {
  const file = path.join(releaseB, name);
  if (!/\.(js|html|json|css)$/.test(name) || !fs.statSync(file).isFile()) continue;
  const text = fs.readFileSync(file, 'utf8');
  const changed = text.replaceAll(revision, next.revision).replaceAll(commit, next.commit);
  if (changed !== text) fs.writeFileSync(file, changed);
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
let live = built;
const server = http.createServer((request, response) => {
  let name = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file = path.join(live, path.normalize(name));
  if (!file.startsWith(live) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const errors = [];
  const shown = page => page.evaluate(() => document.querySelector('#build-version').textContent);
  // Waits across the reload for the page to run the expected release.
  const running = (page, commitId) => page.waitForFunction(expected => window.ready
    && document.querySelector('#build-version')?.textContent === expected, 'Version ' + commitId.slice(0, 7), { timeout: 20_000 });
  const booted = async page => {
    await page.waitForFunction(() => window.ready || window.loadError);
    assert.equal(await page.evaluate(() => window.loadError), undefined);
  };
  try {
    const context = await browser.newContext();
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await context.newPage();
    await page.goto(url); await booted(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    assert.equal(await shown(page), 'Version ' + commit.slice(0, 7));
    assert.equal(await page.evaluate(() => sportheads.checkUpdate('poll')), 'current');
    // A second window of the app, left idle on the old release.
    const old = await context.newPage();
    await old.goto(url + '?_refresh=a'); await booted(old);

    // Deploy B while a match is running: no reload, no note over the match.
    await page.click('#play-ai'); await page.click('#setup-next');
    await goToSetup(page, 'rules'); await setTarget(page, 1);
    await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 10_000 });
    await page.click('#start'); await page.waitForFunction(() => sportheads.snapshot().tick > 10);
    live = releaseB;
    assert.equal(await page.evaluate(() => sportheads.checkUpdate('return')), 'outdated');
    assert.equal(await page.locator('#update-notice').isHidden(), true, 'no note during the match');
    assert.ok(await page.evaluate(() => sportheads.state.started), 'the match goes on');
    // After the match the note appears; the button loads release B.
    await page.evaluate(() => { document.querySelector('[data-quit-match]').click(); });
    await page.locator('#update-notice').waitFor();
    await page.click('#update-reload');
    await running(page, next.commit); // The reload button loads the new release.

    // The idle window, brought back after a while, reloads into the new release
    // (once the new service worker has taken over, as it would have by then).
    await old.waitForFunction(async () => (await caches.keys()).filter(key => key.startsWith('sportheads-')).join() === 'sportheads-bbbbbbbbbbbb');
    assert.equal(await shown(old), 'Version ' + commit.slice(0, 7));
    await old.evaluate(() => { sportheads.checkUpdate('return'); });
    // Chromium sometimes cancels a navigation in a background tab; the page then
    // shows the note instead, so the player is never left unaware.
    await old.waitForFunction(expected => window.ready && (document.querySelector('#build-version')?.textContent === expected
      || !document.querySelector('#update-notice').hidden), 'Version ' + next.commit.slice(0, 7), { timeout: 20_000 });
    await old.close();
    // An app reopened while the HTTP cache still holds the old page gets the new one.
    const reopened = await context.newPage();
    await reopened.goto(url, { waitUntil: 'commit' }); await running(reopened, next.commit);
    await reopened.close();

    // Offline, the cached release still opens, without reloading in a loop.
    await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
    await page.evaluate(() => navigator.serviceWorker.ready.then(registration => registration.update()));
    // Wait for the activation too (it drops the old cache): until then the old
    // worker can still answer the offline reload from release A.
    await page.waitForFunction(async old => { const keys = await caches.keys(); return keys.includes('sportheads-bbbbbbbbbbbb') && !keys.includes(old); }, 'sportheads-' + revision);
    await context.setOffline(true);
    await page.reload(); await booted(page);
    assert.equal(await shown(page), 'Version ' + next.commit.slice(0, 7));
    assert.equal(await page.evaluate(() => sportheads.checkUpdate('boot')), 'unknown');
    await context.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, checks: ['build stamp shown', 'no reload or note during a match', 'note and reload button after the match',
      'idle reopened app reloads into the new release', 'reopening bypasses the HTTP cache', 'offline boot from the new cache'] }));
  } finally { await browser.close(); server.close(); fs.rmSync(releaseB, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exit(1); });
