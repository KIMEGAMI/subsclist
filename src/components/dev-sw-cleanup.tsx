"use client";

import { useEffect } from "react";

const cleanupFlag = "subsclist-dev-sw-cleaned";

export function DevServiceWorkerCleanup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;

    let active = true;

    void (async () => {
      try {
        const alreadyCleaned = window.sessionStorage.getItem(cleanupFlag);
        if (alreadyCleaned === "1") return;

        const registrations = await navigator.serviceWorker.getRegistrations();
        const cacheKeys = "caches" in window ? await caches.keys() : [];

        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }

        if (!active) return;
        window.sessionStorage.setItem(cleanupFlag, "1");
        window.location.reload();
      } catch {
        // Keep the app usable even if cleanup is partially blocked by the browser.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
