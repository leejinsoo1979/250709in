// CRAFT PWA Service Worker
// 전략: 문서(HTML)는 network-first, 정적 자산은 cache-first
const CACHE = 'craft-pwa-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/mobile',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 문서(HTML) 탐색 요청: network-first, 실패 시 캐시, 최후에 /index.html, 그래도 없으면 네트워크 재시도
  const isNav = req.mode === 'navigate' || (req.destination === 'document');
  if (isNav) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          const root = await caches.match('/');
          if (root) return root;
          // 마지막 수단: 빈 HTML 응답이라도 반환해 SW 에러 방지
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title><p>네트워크 연결을 확인해주세요.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // 정적 자산: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
