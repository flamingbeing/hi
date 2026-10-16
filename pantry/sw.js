// Offline support: the app's own files are cached under VERSION (stamped by tools/stamp.mjs: the date the files last
// changed and a hash of them), so a new deploy makes phones fetch the new files once and drop the old cache.
const VERSION = 'pantry-2026-10-16-600c6614';
const FILES = ['app.css', 'config.js', 'firestore-debug.log', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon.svg', 'index.html', 'js/app.js', 'js/catalogue.js', 'js/cloud.js', 'js/logic.js', 'js/photo.js', 'js/sample.js', 'js/scan.js', 'js/store.js', 'manifest.webmanifest'];
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdn.jsdelivr.net/npm/barcode-detector@', 'https://fastly.jsdelivr.net/npm/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(['./', ...FILES])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pantry-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  // Firebase SDK and the barcode reader: keep a copy once fetched, so sharing and scanning work offline too
  if (CDN.some(p => r.url.startsWith(p))) {
    e.respondWith(caches.open(VERSION + '-cdn').then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(caches.match('./', { ignoreSearch: true }).then(hit => hit || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r)));
});
