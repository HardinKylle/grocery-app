/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA fallback for offline launches. Firebase reserved URLs
// (/__/auth/handler, /__/firebase/init.json) must reach the network,
// or Google sign-in breaks.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/__\//],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Push notifications. FCM delivers data-only messages (functions/src/fcm.ts)
// and this worker shows them itself. iOS needs every push to show a
// notification, so even an unreadable payload shows something.
// No firebase-messaging-sw.js: the page passes this worker to getToken().
self.addEventListener('push', (event) => {
  let payload: { data?: Record<string, string>; notification?: { title?: string; body?: string } } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Not JSON. Fall through to the default notification.
  }
  const data = payload.data ?? {};
  const title = data.title ?? payload.notification?.title ?? 'Grocery';
  const body = data.body ?? payload.notification?.body ?? '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      // One notification per kind: a newer one replaces an older one.
      tag: data.kind,
      data: { route: data.route ?? '/' },
    }),
  );
});

// Tapping a notification opens its screen: in the open app if there is
// one (the page routes on the message), else in a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route: string = event.notification.data?.route ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        open.postMessage({ type: 'NAVIGATE', route });
        return;
      }
      await self.clients.openWindow(new URL(route, self.location.origin).href);
    })(),
  );
});
