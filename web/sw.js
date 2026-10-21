// Offline cache for the installed game. build-pages.py fills in the revision and
// the files a match needs; app URLs carry ?v=REVISION, so cached copies never mix
// releases. The page itself is fetched from the network first so updates arrive;
// offline, the cached page of the last release opens instead.
const REVISION = 'dev', FILES = [];
const CACHE = 'sportheads-' + REVISION;

self.addEventListener('install', event => {
  // Bypass the HTTP cache: the page URL has no revision, and a copy still fresh
  // there would store the previous release's page under the new cache.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(file, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('sportheads-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Room signalling, TURN credentials and other hosts always use the network.
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // The page asks the server which release is live; never answer from a cache.
  if (url.pathname.endsWith('/version.json')) return;
  if (request.mode === 'navigate') {
    // Revalidate past the HTTP cache (GitHub Pages allows 10 minutes), so a
    // reopened app gets the release that was just deployed.
    event.respondWith(fetch(new Request(request, { cache: 'no-cache' })).catch(() => caches.match('./', { ignoreSearch: true })
      .then(page => page || Response.error())));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    // Music and late bonus art join the cache the first time they are played.
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
