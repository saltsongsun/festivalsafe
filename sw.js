const CACHE_VERSION = 'safeflow-v' + Date.now();

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // POST 요청, chrome-extension 등은 캐시 안 함
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('supabase.co')) return; // Supabase 요청은 항상 네트워크

  // Always network first for navigation and JS/CSS
  if (e.request.mode === 'navigate' || e.request.destination === 'script' || e.request.destination === 'style') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Other assets: network first with cache fallback
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET' && e.request.url.startsWith('http')) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(cache => {
          try { cache.put(e.request, clone); } catch (err) { /* 캐시 실패 무시 */ }
        });
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
