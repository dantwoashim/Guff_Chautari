const CACHE_VERSION = 'v2';
const APP_SHELL_CACHE = `ashim-app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ashim-runtime-${CACHE_VERSION}`;

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(name))
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

const isStaticAsset = (request) => {
  return ['style', 'script', 'font', 'image'].includes(request.destination);
};

const putInRuntimeCache = async (request, response) => {
  if (!response || !response.ok) {
    return;
  }

  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  } catch (_error) {
    // Skip cache writes when cloning fails (e.g. already-consumed/locked body).
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          await putInRuntimeCache(request, response);
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/index.html');
          return shell || Response.error();
        })
    );
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        const networkFetch = fetch(request)
          .then(async (response) => {
            await putInRuntimeCache(request, response);
            return response;
          })
          .catch(() => cached || Response.error());

        return cached || networkFetch;
      })
    );
  }
});
