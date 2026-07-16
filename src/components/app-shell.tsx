"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { adminLinks, appLinks, siteConfig } from "@/lib/site";
import { useStore } from "@/components/store";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, siteSettings } = useStore();
  const nav = [...appLinks, ...adminLinks.filter(() => user.role === "admin")];

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-500 text-white">S</span>
          {siteConfig.shortName}
        </Link>
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
          <p>{user.name}</p>
          <p className="mt-1 flex items-center gap-2">
            <span>{user.role === "admin" ? "管理者" : "ユーザー"}</span>
            <span>・</span>
            <span>{user.plan === "premium" ? "Premium" : "Free"}</span>
            {siteSettings.maintenanceMode && user.role === "admin" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">メンテナンス中</span>}
          </p>
        </div>
        <nav className="mt-8 space-y-1">
          {nav.map(({ label, href }) => {
            const active = pathname === href || (href === "/subscriptions" && pathname.startsWith("/subscriptions"));
            return (
              <Link
                key={href}
                href={href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="font-bold">{siteConfig.shortName}</Link>
          <Link href="/subscriptions/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">追加</Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {nav.map(({ label, href }) => (
            <Link key={href} href={href} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700">
              {label}
            </Link>
          ))}
        </div>
      </header>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-blue-700">SubscList</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}
