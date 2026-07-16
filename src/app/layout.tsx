import type { Metadata } from "next";
import { StoreProvider } from "@/components/store";
import { createSeedState } from "@/lib/seed-state";
import { siteConfig } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: ["サブスク管理", "解約管理", "更新日", "請求", "分析", "Free", "Premium"],
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = createSeedState();

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full">
        <StoreProvider initialState={initialState}>{children}</StoreProvider>
      </body>
    </html>
  );
}
