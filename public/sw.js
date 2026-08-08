/**
 * Service worker.
 *
 * Chrome will not offer "Add to Home Screen" without one that handles fetch, so
 * this is the difference between the site being installable and not. It also
 * makes the gallery usable offline once visited.
 *
 * Strategies, chosen per resource:
 *   - navigations   network first, falling back to the cached shell offline
 *   - images        cache first, since a photograph at a given URL never changes
 *                   (uploads always get a fresh suffixed path)
 *   - API           network only, so the gallery is never stale
 *   - build assets  cache first, they are content-hashed
 */

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = `images-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

/** Keeps the photo cache from growing without bound on a phone. */
const MAX_IMAGES = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, IMAGE_CACHE, ASSET_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Evicts oldest entries once a cache passes its limit. */
const trim = async (cacheName, max) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
};

const isImage = (request, url) =>
  request.destination === 'image' ||
  url.pathname.startsWith('/_vercel/image') ||
  /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API: a stale gallery or a stale session is worse than a
  // spinner.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone());
          return fresh;
        } catch {
          // Offline: any route falls back to the cached shell, and the SPA
          // router takes it from there.
          const cached = await caches.match('/', { cacheName: SHELL_CACHE });
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  if (isImage(request, url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: IMAGE_CACHE });
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(IMAGE_CACHE);
            await cache.put(request, fresh.clone());
            void trim(IMAGE_CACHE, MAX_IMAGES);
          }
          return fresh;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { cacheName: ASSET_CACHE });
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(ASSET_CACHE);
          await cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
  }
});
