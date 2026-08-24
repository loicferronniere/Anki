const CACHE_NAME = 'vocab-app-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Les CDN externes (JSZip, sql.js, Google Fonts) passent directement au réseau.
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Réseau d'abord : on récupère toujours la dernière version en ligne si possible,
  // et on retombe sur le cache uniquement hors connexion. Évite de rester bloqué
  // sur une ancienne version après une mise à jour.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
