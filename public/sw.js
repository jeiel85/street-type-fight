// 서비스 워커: PWA 설치 요건 충족 및 오프라인 플레이를 위한 정적 자산 캐시.
// 빌드 시 vite.config.ts가 버전 해시와 번들 자산 목록을 주입한다.

const CACHE_PREFIX = 'street-type-fight-';
const SW_VERSION = '__SW_VERSION__';
const CACHE_NAME = `${CACHE_PREFIX}${SW_VERSION}`;
const IS_BUILT = !SW_VERSION.startsWith('__');

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  /* __SW_PRECACHE__ */
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 개발 서버(vite dev)에서는 HMR·모듈 갱신이 꼬이지 않도록 항상 네트워크를 먼저 본다.
  if (!IS_BUILT) {
    if (url.pathname.includes('/@vite') || url.pathname.includes('/src/') || url.pathname.includes('/node_modules/')) {
      return;
    }
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // 페이지 탐색(HTML)은 네트워크 우선, 오프라인이면 캐시된 index.html로 복구한다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('./index.html')) || (await caches.match('./'))),
    );
    return;
  }

  // 해시가 붙은 번들·아이콘 등 정적 자산은 캐시 우선, 없으면 네트워크에서 받아 저장한다.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
