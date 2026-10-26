// Service worker: offline ljuska (network-first) + web push obavještenja.
const CACHE = 'medjasi-v2-cache-v4';
const SHELL = ['./', 'index.html', 'privatnost.html', 'sitemap.xml', 'robots.txt', 'css/style.css', 'js/app.js', 'js/pages/home.js', 'js/pages/stats.js', 'js/pages/search.js', 'js/seo.js', 'js/match-extras.js', 'js/pages/admin-news.js', 'js/pages/admin-extra.js', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
});
self.addEventListener('push', (e) => {
  let data = { title: 'Međasi Futsal Liga', body: '', url: '#/' };
  try { data = { ...data, ...e.data.json() }; } catch (_) { /* prazan payload */ }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: 'images/icon-192.png', badge: 'images/icon-192.png',
    data: { url: data.url },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin));
    if (open) { open.navigate(target); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});