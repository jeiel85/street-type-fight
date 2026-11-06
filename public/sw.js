// 서비스 워커: PWA 설치 요건 충족 및 오프라인 플레이를 위한 정적 자산 캐시.
// 빌드 시 vite.config.ts가 버전 해시와 번들 자산 목록을 주입한다.

const CACHE_PREFIX = 'street-type-fight-';
const SW_VERSION = '__SW_VERSION__';
const CACHE_NAME = `${CACHE_PREFIX}${SW_VERSION}`;
const IS_BUILT = !SW_VERSION.startsWith('__');

// 주소에 해시가 없는 파일. 내용이 바뀌어도 주소가 같아서, 그냥 받으면 HTTP 캐시(Pages 10분)에 남은 옛 파일이
// 새 빌드 캐시에 들어가 다음 배포까지 캐시 우선으로 나간다(manifest id를 고쳐도 Chrome이 옛 id를 보던 문제).
// 그래서 설치 때 HTTP 캐시를 건너뛰고 새로 받는다.
const UNHASHED_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];
// 빌드가 넣는 번들 자산. 파일 이름에 내용 해시가 붙어 있어 HTTP 캐시를 그대로 써도 된다.
const BUNDLE_URLS = [
  /* __SW_PRECACHE__ */
];

self.addEventListener('install', (event) => {
  const requests = [...UNHASHED_URLS.map((url) => new Request(url, { cache: 'reload' })), ...BUNDLE_URLS];
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(requests.map((req) => cache.add(req))))
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
