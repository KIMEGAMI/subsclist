"use client";

import { useEffect } from "react";

async function removeServiceWorkersAndCaches() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const worker =
          registration.active ??
          registration.waiting ??
          registration.installing;
        return worker ? new URL(worker.scriptURL).pathname === "/sw.js" : false;
      })
      .map((registration) => registration.unregister()),
  );

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith("subsclist-shell-"))
        .map((key) => caches.delete(key)),
    );
  }
}

export function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void removeServiceWorkersAndCaches().catch(() => {
        // Development must remain usable even when browser cleanup is blocked.
      });
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        console.error("Service Workerの登録に失敗しました。");
      });
  }, []);

  return null;
}
