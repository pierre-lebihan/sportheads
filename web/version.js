// Build stamp, filled in by build-pages.py: `revision` names the cached files of
// a release (it changes only when the published game changes), `commit` is the
// Git commit it was built from. 'dev' means an unbuilt checkout.
export const BUILD = Object.freeze({ revision: 'dev', commit: 'dev' });

const CHECK_EVERY = 10 * 60 * 1000;
// Coming back after this long counts as reopening the app (iOS and Android keep
// installed apps alive in the background instead of starting them again).
const AWAY = 60 * 1000;
const TRIED = 'sportheads-update-tried';

function sessionStore() { try { return globalThis.sessionStorage; } catch { return null; } }

async function liveRevision() {
  const response = await fetch('./version.json', { cache: 'no-store' });
  if (!response.ok) throw Error('version.json ' + response.status);
  const { revision } = await response.json();
  if (typeof revision !== 'string' || !revision) throw Error('Invalid version.json');
  return revision;
}

// Compares this page with the live release. An older page reloads by itself
// only when nothing can be lost: at boot, or when the player comes back to an
// idle menu. Otherwise `notify` asks the player to reopen it. Offline, or on an
// unbuilt page, every check simply answers 'unknown'.
export function createUpdateWatcher({ idle, notify, reload = () => location.reload(), fetchRevision = liveRevision,
  revision = BUILD.revision, storage = sessionStore(), now = Date.now } = {}) {
  let latest = null, hiddenAt = null, pending = null;
  const triedFor = () => { try { return storage?.getItem(TRIED); } catch { return null; } };
  const markTried = value => { try { storage?.setItem(TRIED, value); } catch { /* Then it may reload once more. */ } };

  async function check(reason = 'poll') {
    if (revision === 'dev') return 'unknown';
    let live;
    try { live = await fetchRevision(); } catch { return 'unknown'; }
    if (live === revision) return 'current';
    const fresh = latest !== live; latest = live;
    // Fetch the new service worker now, so the offline copy follows the release.
    globalThis.navigator?.serviceWorker?.getRegistration?.().then(registration => registration?.update()).catch(() => {});
    // A stale CDN copy could answer with the old page again: reload only once per release.
    if ((reason === 'boot' || reason === 'return') && idle() && triedFor() !== live) { markTried(live); reload(); return 'reloading'; }
    if (fresh) notify(live);
    return 'outdated';
  }
  function checkSoon(reason) { return pending ??= check(reason).finally(() => { pending = null; }); }

  return {
    check: checkSoon,
    get latest() { return latest; },
    start() {
      checkSoon('boot');
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { hiddenAt = now(); return; }
        const away = hiddenAt !== null && now() - hiddenAt >= AWAY; hiddenAt = null;
        checkSoon(away ? 'return' : 'visible');
      });
      window.addEventListener('online', () => checkSoon('online'));
      setInterval(() => { if (!document.hidden) checkSoon('poll'); }, CHECK_EVERY);
    },
  };
}
