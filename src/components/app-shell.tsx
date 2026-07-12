"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const brand = "サブスクリスト";
const nav = [
  { label: "ダッシュボード", href: "/dashboard", icon: "D" },
  { label: "サブスク", href: "/subscriptions", icon: "S" },
  { label: "カレンダー", href: "/calendar", icon: "C" },
  { label: "分析", href: "/analytics", icon: "A" },
  { label: "月次レポート", href: "/monthly-report", icon: "M" },
  { label: "見直し", href: "/review", icon: "R" },
  { label: "カテゴリ", href: "/categories", icon: "K" },
  { label: "支払い方法", href: "/payment-methods", icon: "P" },
  { label: "支払い履歴", href: "/payments", icon: "Y" },
  { label: "支払い累計", href: "/payment-totals", icon: "T" },
  { label: "通知", href: "/notifications", icon: "N" },
  { label: "CSV", href: "/export", icon: "E" },
  { label: "設定", href: "/settings", icon: "G" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#eef9fb] bg-[url('/app-background.png')] bg-cover bg-fixed bg-center text-slate-950">
      <div className="fixed inset-0 bg-white/28 backdrop-blur-[2px]" aria-hidden="true" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17.5rem] border-r border-white/65 bg-white/88 px-5 py-6 shadow-[18px_0_50px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:flex lg:flex-col">
        <Link href="/dashboard" className="group flex items-center gap-3 text-xl font-black">
          <span className="grid size-11 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-cyan-500 to-fuchsia-500 text-white shadow-lg shadow-blue-500/20 transition group-hover:scale-105">S</span>
          <span>
            {brand}
            <span className="block text-xs font-bold text-slate-500">Subscription OS</span>
          </span>
        </Link>
        <nav className="mt-8 space-y-1.5 overflow-y-auto pr-1">
          {nav.map(({ label, href, icon }) => {
            const active = pathname === href || (href === "/subscriptions" && pathname.startsWith("/subscriptions"));
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                  active ? "bg-blue-600 text-white shadow-lg shadow-blue-600/18" : "text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm"
                }`}
              >
                <span className={`grid size-7 place-items-center rounded-md text-[11px] font-black ${
                  active ? "bg-white/18 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-700"
                }`}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
          <p className="text-sm font-black text-blue-950">{"固定費を見える化"}</p>
          <p className="mt-2 text-xs leading-5 text-blue-800">{"更新日、解約期限、見直し候補、支払い履歴をまとめて確認できます。"}</p>
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-white/65 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-black">{brand}</Link>
          <Link href="/subscriptions/new" className="btn-primary min-h-0 px-3 py-2 text-sm">{"追加"}</Link>
        </div>
        <div className="subtle-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {nav.map(({ label, href }) => (
            <Link key={href} href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${
              pathname === href ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white/80 text-slate-700"
            }`}>
              {label}
            </Link>
          ))}
        </div>
      </header>
      <main className="relative z-10 lg:pl-[17.5rem]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-white/55 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase text-blue-700">SubscList</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-white/75 bg-white/92 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl ${className}`}>{children}</section>;
}
