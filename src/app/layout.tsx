import type { Metadata } from "next";
import { MaintenanceModeGate } from "@/components/maintenance-mode-gate";
import { publicSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: publicSiteUrl,
  title: "SubscList | サブスクリプション管理システム",
  description: "契約、課金、更新日、支払い履歴、見直し候補をまとめて管理できるサブスクリプション管理サービスです。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "SubscList",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "SubscList",
    images: [{ url: "/hero-subsclist.png", width: 1536, height: 1024, alt: "SubscList" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <MaintenanceModeGate>{children}</MaintenanceModeGate>
      </body>
    </html>
  );
}
