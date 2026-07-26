"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type SystemStatus = {
  maintenance: boolean;
  isAdmin: boolean;
};

const allowedDuringMaintenance = ["/login", "/api", "/_next"];

export function MaintenanceModeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/system/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SystemStatus | null) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active) setStatus(null);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const allowed = allowedDuringMaintenance.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (status?.maintenance && !status.isAdmin && !allowed) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-lg rounded-lg border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
          <p className="text-sm font-black text-cyan-200">SubscList</p>
          <h1 className="mt-3 text-2xl font-black">ただいまメンテナンス中です</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            現在、サービス改善のため一時的にアクセスを制限しています。管理者はログイン後に管理者メニューから通常モードへ戻せます。
          </p>
          <a href="/login" className="mt-6 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950">
            管理者ログインへ
          </a>
        </section>
      </main>
    );
  }

  return children;
}
