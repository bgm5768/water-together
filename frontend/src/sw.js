/* Generated at build time; cache only this app's explicit public asset list. */
const ASSETS = __PRECACHE__;
const PREFIX = 'water-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + __REVISION__;
self.addEventListener('install', (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    req.headers.has('Authorization') ||
    !ASSETS.includes(url.pathname) ||
    url.search
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        try {
          return await fetch(req);
        } catch {
          return (
            (await cache.match(new URL('./index.html', self.registration.scope).href)) ||
            Response.error()
          );
        }
      }
      return (await cache.match(req)) || fetch(req);
    })(),
  );
});
self.addEventListener('push', (event) => {
  let message;
  try {
    message = event.data?.json();
  } catch {
    /* Older, bodyless pushes remain supported. */
  }
  const title =
    typeof message?.title === 'string' ? message.title.slice(0, 100) : '물 마실 시간이에요 💧';
  const body =
    typeof message?.body === 'string'
      ? message.body.slice(0, 300)
      : '잠깐 쉬면서 물 한 잔 마셔보세요.';
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        icon: new URL('icon-cinematic-192.png', self.registration.scope).href,
        badge: new URL('notification-badge.png', self.registration.scope).href,
        tag: message?.kind === 'partner' ? 'water-partner' : 'water-reminder',
        renotify: true,
        silent: false,
        vibrate: [120, 70, 120],
        data: { url: self.registration.scope },
      });
      // Audio requires an active page and a prior user gesture. Never play it in a worker.
      const windows = await self.clients.matchAll({ type: 'window' });
      const visible = windows.find(
        (client) =>
          client.visibilityState === 'visible' && client.url.startsWith(self.registration.scope),
      );
      visible?.postMessage({ type: 'WATER_REMINDER' });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      for (const client of await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          await client.navigate(self.registration.scope);
          return client.focus();
        }
      }
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
