import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "サブスクリスト | サブスクリプション管理システム",
  description: "契約、課金、更新日、支出分析を一元管理するサブスクリプション管理SaaS。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "サブスクリスト",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
