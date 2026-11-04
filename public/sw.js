/* Service worker for push notifications.
 * Registered from src/utils/notifications.tsx (`navigator.serviceWorker.register('/sw.js')`). */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* ---------- Offline app shell (Android + iOS "Add to Home Screen") ----------
   Navigations are served from cache when offline; hashed build assets are
   cached-first and refreshed in the background so the app opens instantly. */
const APP_SHELL = 'pt-app-shell-v1';
const ASSETS = 'pt-assets-v1';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // never touch Supabase/API calls

  // Supabase auth callbacks must always hit the network.
  if (url.pathname.includes('/auth/v1/') || url.pathname.startsWith('/api/')) return;

  // Page navigations: network first, fall back to the cached shell offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit || caches.match(req).then((h2) => h2 || Response.error()))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Show a notification when a push message arrives from the server.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Period Tracker', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Period Tracker';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'period-tracker',
    data: data.url ? { url: data.url } : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus/open the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })
  );
});
