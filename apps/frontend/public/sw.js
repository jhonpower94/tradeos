/* Trading OS Web Push service worker v2 — PNG icons for iOS APNs. */
self.addEventListener('push', (event) => {
  let title = 'Trading OS';
  let body = '';
  let data = {};
  try {
    const raw = event.data ? event.data.text() : '{}';
    const parsed = JSON.parse(raw);
    title = parsed.title || title;
    body = parsed.body || '';
    data = parsed.data || {};
  } catch {
    body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
