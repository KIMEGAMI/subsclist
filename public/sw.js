self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("subsclist-shell-v1")
      .then((cache) => cache.add("/offline.html"))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("subsclist-shell-") &&
              key !== "subsclist-shell-v1",
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(async () => {
      const offlinePage = await caches.match("/offline.html");
      return (
        offlinePage ??
        new Response(
          "オフラインです。インターネット接続後にもう一度お試しください。",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        )
      );
    }),
  );
});
