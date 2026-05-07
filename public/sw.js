// Service Worker DISABLED — Self-unregister
// 이전 버전에서 fetch 가로채기 오류로 페이지 로딩 실패 사례 발생 → SW 자체 비활성화.
// 기존 사용자가 이 파일을 받으면 즉시 자기 자신을 unregister 하고 모든 캐시를 비워서
// 다음 새로고침부터 깨끗한 네트워크 요청만 사용하도록 한다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    try {
      await self.registration.unregister();
    } catch (_) {}
    try {
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => {
        // 새로고침 강제 — 다음 요청부터 SW 없이 동작
        client.navigate(client.url).catch(() => {});
      });
    } catch (_) {}
  })());
});

// fetch 이벤트는 절대 가로채지 않음 — 모든 요청을 네트워크가 직접 처리
