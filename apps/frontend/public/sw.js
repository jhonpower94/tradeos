/* Trading OS Web Push service worker v3 — tap opens the matching in-app path. */
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

function pathFromNotificationData(data) {
  const raw = data && typeof data.url === 'string' ? data.url : '/';
  if (!/^\/[A-Za-z0-9/_-]*$/.test(raw)) return '/';
  return raw;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = pathFromNotificationData(event.notification.data);
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(url);
          return undefined;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
