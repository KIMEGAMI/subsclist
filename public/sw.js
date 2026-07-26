self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
      } catch {
        // Ignore unregister failures. This file's job is to end stale SW control without breaking the app.
      }
    })(),
  );
});

self.addEventListener("fetch", () => {
  // Intentionally empty.
});
