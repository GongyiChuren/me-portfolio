// Register a no-op service worker and clear old Workbox caches.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }).catch(() => {});
    if (window.caches) {
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).catch(() => {});
    }
  });
}
