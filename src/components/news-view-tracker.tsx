"use client";

import { useEffect } from "react";

export function NewsViewTracker({ newsItemId }: { newsItemId: string }) {
  useEffect(() => {
    void fetch(`/api/subscription-news/${newsItemId}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  }, [newsItemId]);
  return null;
}
