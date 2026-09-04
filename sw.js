const CACHE_NAME = 'tranzlet-shell-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/dashboard.html',
  '/manifest.json',
  '/pwa.js',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Return the installed shell immediately, then refresh it quietly.
        event.waitUntil(
          fetch(request).then((response) => {
            if (response.ok) {
              return caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
          }).catch(() => {})
        );
        return cached;
      }

      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => isNavigation ? caches.match('/index.html') : Response.error());
    })
  );
});
