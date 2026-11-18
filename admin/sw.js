/* Dealpin Admin service worker. Caches only the console's own files so it installs and opens fast.
   Live data (Supabase) is never cached, so every number and change is always the current one. */
const V = 'dealpin-admin-v7';
const SHELL = ['./', './index.html', './admin.css', './admin.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', '../app/js/config.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase and others: straight to network
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) caches.open(V).then(c => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
});
