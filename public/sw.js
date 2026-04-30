// SAFEFLOW Service Worker v3 - 안전 모드
// POST/PUT/DELETE/PATCH/HEAD 요청은 절대 캐시하지 않음
const CACHE_VERSION = 'safeflow-v3-' + new Date().toISOString().slice(0, 10);

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  
  // ❌ GET 외 모든 메서드는 SW가 절대 건드리지 않음 (POST/PUT 등)
  if (req.method !== 'GET') return;
  
  // ❌ http(s) 프로토콜이 아니면 무시 (chrome-extension 등)
  const url = req.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  
  // ❌ Supabase / API 요청은 항상 네트워크 (캐시 안 함)
  if (url.includes('supabase.co') || url.includes('/api/') || url.includes('/rest/v1/')) return;
  
  // ❌ 외부 CDN도 항상 네트워크 (캐시 충돌 방지)
  if (url.includes('cdn.jsdelivr.net') || url.includes('fonts.googleapis.com') || url.includes('cdnjs.cloudflare.com')) return;
  
  // navigation/script/style: 항상 네트워크 우선 (캐시는 폴백만)
  if (req.mode === 'navigate' || req.destination === 'script' || req.destination === 'style') {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }
  
  // 그 외 (이미지, 폰트 등): 네트워크 우선 + 캐시 fallback
  e.respondWith(
    fetch(req).then((res) => {
      // 캐시 가능한 응답만 저장 (200 OK, GET 한정)
      if (res && res.ok && req.method === 'GET' && url.startsWith('http')) {
        try {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            try {
              cache.put(req, clone);
            } catch (err) {
              // 캐시 put 실패는 무시 (POST 등은 절대 여기 안 옴, 이중 안전장치)
              console.warn('[SW] cache.put 실패 (무시):', err.message);
            }
          }).catch(() => {});
        } catch (err) { /* 무시 */ }
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
