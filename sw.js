// Service worker intentionally disabled.
// This site is GitHub Pages static output; navigation to /radar/ must request
// the real /radar/index.html instead of an old app-shell index.html cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', () => {});
