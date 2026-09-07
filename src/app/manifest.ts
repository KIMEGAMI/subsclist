import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "サブスクリスト",
    short_name: "SubscList",
    description: "サブスクリプションの更新日、支払い、見直しを管理するアプリ",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "ja",
    background_color: "#eef9fb",
    theme_color: "#2563eb",
    categories: ["finance", "productivity", "utilities"],
    shortcuts: [
      { name: "ダッシュボード", short_name: "ホーム", url: "/dashboard" },
      { name: "サブスク一覧", short_name: "サブスク", url: "/subscriptions" },
      { name: "更新カレンダー", short_name: "カレンダー", url: "/calendar" },
    ],
    icons: [
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
