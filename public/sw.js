// scripts/stamp-sw.mjs fills VERSION and SHELL in dist/sw.js. Unstamped (the dev server) it does nothing.
const VERSION = 'dev';
const SHELL = ['/'];
const CACHE = `karmahouse-${VERSION}`;
// Content-hashed or versioned paths: a new build gets new names, so a cached copy never goes stale.
const IMMUTABLE = /^\/(_expo\/static|assets|maplibre)\//;
const PAGE_TIMEOUT_MS = 5000;

if (VERSION !== 'dev') {
  self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
  });

  self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('karmahouse-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()));
  });

  self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    // Supabase, map tiles and listing photos stay on the network: they change and can carry a session.
    if (url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') event.respondWith(page(request));
    else if (IMMUTABLE.test(url.pathname)) event.respondWith(immutable(request));
  });
}

// Fresh page when the network answers in time; otherwise the precached shell, which always
// matches the precached bundle. The shell is never refreshed from here, so the two cannot drift.
async function page(request) {
  const network = fetch(request);
  network.catch(() => {});
  const shell = await caches.match('/', { cacheName: CACHE });
  if (!shell) return network;
  try {
    const response = await Promise.race([network, new Promise(resolve => setTimeout(resolve, PAGE_TIMEOUT_MS))]);
    if (response?.ok) return response;
  } catch {}
  return shell;
}

async function immutable(request) {
  const cached = await caches.match(request, { cacheName: CACHE });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
  }
  return response;
}
