/* 婚禮手帳 Service Worker：外殼 cache-first（帶版本號）；api.github.com 一律走網路 */
var VERSION = '0.2.0';
var CACHE = 'wedding-app-shell-' + VERSION;
var SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/util.js', 'js/schema.js', 'js/merge.js', 'js/calc.js', 'js/store-local.js', 'js/store-github.js', 'js/sync.js', 'js/ui.js', 'js/native.js',
  'js/view-overview.js', 'js/view-tasks.js', 'js/view-budget.js', 'js/view-guests.js', 'js/view-more.js', 'js/view-schedule.js',
  'js/view-vendors.js', 'js/view-music.js', 'js/view-tables.js', 'js/view-settings.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'sample/meta.json', 'sample/tasks.json', 'sample/decisions.json', 'sample/budget.json', 'sample/guests.json', 'sample/tables.json',
  'sample/gifts.json', 'sample/vendors.json', 'sample/schedule.json', 'sample/supplies.json', 'sample/music.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('wedding-app-shell-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.github.com' || url.origin !== self.location.origin) return;   // 不攔截：直接走網路、不快取
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { if (req.mode === 'navigate') return caches.match('index.html'); throw new Error('offline'); });
  }));
});
