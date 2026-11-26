/// <reference lib="webworker" />

const CACHE_NAME = 'operational-sense-shell-v1';
const APP_ASSETS: string[] = ['__APP_ASSETS__'];
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...APP_ASSETS];
const worker = self as unknown as ServiceWorkerGlobalScope;

worker.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('operational-sense-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || requestUrl.origin !== worker.location.origin) return;

  // API responses and technician audio are deliberately never cached here.
  if (requestUrl.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/index.html')) ?? Response.error()));
    return;
  }

  const isStaticAsset = ['script', 'style', 'image', 'font'].includes(request.destination);
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
