"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/components/store";
import { MaintenanceView } from "@/components/public-views";

function VerifyPrompt() {
  return (
    <AppShell>
      <PageHeader title="メール認証が必要です" description="管理画面の利用にはメール認証が必要です。認証案内ページで確認を完了してください。" />
      <Link href="/verify-email" className="rounded-lg bg-blue-600 px-4 py-3 font-bold text-white">
        認証案内へ
      </Link>
    </AppShell>
  );
}

function AccessDenied() {
  return (
    <AppShell>
      <PageHeader title="管理者専用" description="この画面は管理者アカウントでのみ利用できます。" />
      <Link href="/dashboard" className="rounded-lg bg-blue-600 px-4 py-3 font-bold text-white">
        ダッシュボードへ
      </Link>
    </AppShell>
  );
}

export function PrivateGate({ children }: { children: ReactNode }) {
  const { user, siteSettings } = useStore();
  if (siteSettings.maintenanceMode && user.role !== "admin") return <MaintenanceView />;
  if (!user.emailVerified) return <VerifyPrompt />;
  return children;
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { user, siteSettings } = useStore();
  if (siteSettings.maintenanceMode && user.role !== "admin") return <MaintenanceView />;
  if (user.role !== "admin") return <AccessDenied />;
  if (!user.emailVerified) return <VerifyPrompt />;
  return children;
}
