// Pantry offline support. The deploy stamps VERSION (tools/stamp-versions.mjs: 'pantry-v1' becomes
// 'pantry-<date>-<hash>' from every file the app serves); never change it by hand. Change the v<N> only when this
// file's own logic changes.
//
// - Install: every SHELL file or nothing (a half-filled cache would break the app offline). It waits: no skipWaiting
//   here, so a new version never swaps files under someone in the middle of something. The page tells it to take
//   over ('take-over') when nobody is typing or has a sheet open, or when they tap Restart on the "Update ready" toast.
// - Activate: deletes only this app's old caches (names starting 'pantry-').
// - Fetch: the app's own files cache-first; the Firebase SDK (gstatic) and the barcode reader (jsDelivr) are kept
//   once fetched, so sharing and scanning keep working with no signal. Firebase's sign-in pages (/__/), sw.js itself
//   and everything else (Firestore, Google, Open Food Facts) always go to the network.
const VERSION = 'pantry-v1';
const SHELL = [
  './',
  'index.html',
  'pantry.css',
  'manifest.webmanifest',
  'config.js',
  'js/app.js',
  'js/logic.js',
  'js/catalogue.js',
  'js/store.js',
  'js/sample.js',
  'js/cloud.js',
  'js/scan.js',
  'js/guide.js',
  'js/photo.js',
  'js/quick.js',
  'js/tour.js',
  'js/places.js',
  'js/people.js',
  'js/merge.js',
  'js/sync.js',
  'js/select.js',
  'js/order.js',
  'js/drag.js',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  '/homedesign/tokens.css',
  '/homedesign/app.css',
  '/homedesign/app.js',
  '/homedesign/icons.svg',
];
const PREFIX = 'pantry-';
const CDN = ['https://www.gstatic.com/firebasejs/', 'https://cdn.jsdelivr.net/npm/barcode-detector@', 'https://fastly.jsdelivr.net/npm/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'take-over') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (CDN.some(p => r.url.startsWith(p))) {
    e.respondWith(caches.open(VERSION).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  if (url.pathname.startsWith('/__/') || url.pathname.endsWith('/sw.js') || !url.pathname.startsWith(scope.pathname) && !url.pathname.startsWith('/homedesign/')) return;
  if (r.mode === 'navigate') {
    e.respondWith(caches.match('./', { ignoreSearch: true }).then(hit => hit || fetch(r)));
    return;
  }
  e.respondWith(caches.open(VERSION).then(async c => (await c.match(r, { ignoreSearch: true })) || fetch(r).then(res => {
    if (res.ok && res.type === 'basic') c.put(r, res.clone());
    return res;
  })));
});
