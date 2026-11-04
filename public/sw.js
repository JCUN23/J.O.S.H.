// Minimal service worker: exists only so Chrome treats the panel as installable.
// No caching on purpose — the dashboard should always show live data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // pass-through
