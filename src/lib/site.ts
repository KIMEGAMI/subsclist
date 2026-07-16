export const siteConfig = {
  name: "サブスクリスト",
  shortName: "SubscList",
  description: "サブスクの契約、更新日、支払い方法、分析をまとめて管理するツール。",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://subsclist.shinji.work",
  premiumPriceLabel: "月額480円",
  freeSubscriptionLimit: 10,
  freeCategoryLimit: 5,
};

export const publicLinks = [
  { label: "料金", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
  { label: "利用規約", href: "/terms" },
  { label: "プライバシー", href: "/privacy" },
  { label: "特商法", href: "/tokushoho" },
] as const;

export const appLinks = [
  { label: "ダッシュボード", href: "/dashboard" },
  { label: "サブスク", href: "/subscriptions" },
  { label: "カレンダー", href: "/calendar" },
  { label: "分析", href: "/analytics" },
  { label: "カテゴリ", href: "/categories" },
  { label: "支払い方法", href: "/payment-methods" },
  { label: "通知", href: "/notifications" },
  { label: "CSV", href: "/export" },
  { label: "設定", href: "/settings" },
] as const;

export const adminLinks = [
  { label: "管理", href: "/admin" },
] as const;

export const privateRoutes = [
  "/dashboard",
  "/subscriptions",
  "/calendar",
  "/analytics",
  "/categories",
  "/payment-methods",
  "/notifications",
  "/export",
  "/settings",
  "/billing",
  "/verify-email",
  "/admin",
  "/maintenance",
] as const;