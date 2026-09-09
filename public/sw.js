/**
 * Service worker for the Kajeh menu.
 *
 * Strategy is deliberately split by resource type:
 *
 *  - The menu HTML uses NETWORK-FIRST. A cached menu that shows a sold-out dish
 *    as available, or last week's prices, is worse than a slow menu. The cache
 *    is the fallback for a dead connection, not the default.
 *  - Static assets (icons, fonts, CSS, JS) use CACHE-FIRST. They are
 *    content-hashed by Next, so a stale hit is impossible.
 *
 * Bumping CACHE_VERSION retires every old cache on the next activation.
 *
 * Note on manifest scope: it is "/" rather than "/menu". Manifest scope is a
 * STRING prefix match, not a path-segment match, so "/menu" would also capture
 * "/menu-items" and "/menu-engineering" — the admin routes. "/" is unambiguous,
 * and the admin exclusion below is what actually keeps those pages out of the
 * cache.
 */
const CACHE_VERSION = 'kajeh-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const SHELL_ASSETS = [
  '/menu',
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one failed asset does not abort the whole install.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !name.startsWith(CACHE_VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is cacheable, and only same-origin plus Google Fonts.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com');
  if (!isSameOrigin && !isFont) return;

  // Never cache the admin panel or the API — those must always be live, and
  // caching an authenticated response risks serving it to the wrong person.
  if (isSameOrigin && (url.pathname.startsWith('/api/') || isAdminPath(url.pathname))) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

const ADMIN_PREFIXES = [
  '/dashboard', '/menu-items', '/recipes', '/ingredients', '/inventory',
  '/purchases', '/suppliers', '/waste', '/expenses', '/employees',
  '/costing', '/reports', '/menu-engineering', '/digital-menu',
  '/alerts', '/settings', '/login',
];

function isAdminPath(pathname) {
  return ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Live data preferred; cache only when the network cannot answer. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline');
    if (offline) return offline;
    return new Response('آفلاین هستید', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Hashed assets never change under a given URL, so cache wins. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const cache = await caches.open(ASSET_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
