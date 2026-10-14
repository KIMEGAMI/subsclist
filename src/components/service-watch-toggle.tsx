"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ServiceWatchToggle({ serviceId, watching }: { serviceId: string; watching: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setLoading(true); setError("");
    try {
      const response = await fetch(watching ? `/api/service-watchlist/${serviceId}` : "/api/service-watchlist", {
        method: watching ? "DELETE" : "POST",
        headers: watching ? undefined : { "Content-Type": "application/json" },
        body: watching ? undefined : JSON.stringify({ serviceId }),
      });
      if (!response.ok) throw new Error("更新に失敗しました。");
      router.refresh();
    } catch { setError("ウォッチの更新に失敗しました。時間をおいてもう一度お試しください。"); }
    finally { setLoading(false); }
  }
  return <div className="space-y-2"><button type="button" onClick={toggle} disabled={loading} className={watching ? "btn-secondary" : "btn-primary"}>{loading ? "更新中..." : watching ? "ウォッチ解除" : "ウォッチする"}</button>{error && <p className="text-xs font-bold text-red-700">{error}</p>}</div>;
}
