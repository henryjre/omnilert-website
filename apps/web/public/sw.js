self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'Omnilert Notification';
  const body = payload.message || '';
  const linkUrl = payload.linkUrl || '/account/notifications';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: {
        linkUrl,
      },
      tag: payload.notificationId || undefined,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const linkUrl = event.notification?.data?.linkUrl || '/account/notifications';
  const url = new URL(linkUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(url);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
