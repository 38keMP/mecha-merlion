// オフラインでも開けるようにするサービスワーカー。
// 更新がすぐ反映されるよう、まずネットワークから取り、つながらないときだけ保存済みのものを使う。
const CACHE = 'maerlion-v2';
const FILES = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/config.js', './js/storage.js', './js/state.js', './js/game.js', './js/results.js',
  './js/render-scene.js', './js/render-merlion.js', './js/render-game.js', './js/record.js', './js/app.js',
  './assets/icon-192.png', './assets/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
