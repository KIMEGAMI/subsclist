import type { Category, ContactMessage, PaymentMethod, SiteSettings, Subscription, UserAccount } from "./types";

export const defaultUser: UserAccount = {
  id: "demo-user",
  name: "デモユーザー",
  email: "user@shinji.work",
  plan: "free",
  emailVerified: true,
  role: "user",
};

export const defaultAdminUser: UserAccount = {
  id: "demo-admin",
  name: "管理者",
  email: "admin@shinji.work",
  plan: "premium",
  emailVerified: true,
  role: "admin",
};

export const defaultAccounts = [];

export const defaultSiteSettings: SiteSettings = {
  maintenanceMode: false,
};

export const defaultContactMessages: ContactMessage[] = [];

export const defaultCategories: Category[] = [
  { id: "cat-video", name: "動画", color: "#4f46e5" },
  { id: "cat-music", name: "音楽", color: "#ec4899" },
  { id: "cat-work", name: "仕事", color: "#0ea5e9" },
  { id: "cat-study", name: "学習", color: "#22c55e" },
  { id: "cat-cloud", name: "クラウド", color: "#f59e0b" },
  { id: "cat-other", name: "その他", color: "#64748b" },
];

export const defaultPaymentMethods: PaymentMethod[] = [
  { id: "pay-visa", name: "Visa Business", type: "credit_card", memo: "メインカード" },
  { id: "pay-paypay", name: "PayPay", type: "paypay" },
  { id: "pay-bank", name: "銀行引落", type: "bank" },
];

export const defaultSubscriptions: Subscription[] = [
  {
    id: "sub-netflix",
    name: "Netflix",
    price: 1980,
    currency: "JPY",
    billingCycle: "monthly",
    nextBillingDate: "2026-07-04",
    categoryId: "cat-video",
    paymentMethodId: "pay-visa",
    status: "active",
    notifyDaysBefore: 7,
    usageFrequency: "high",
    memo: "家族で利用中",
    serviceUrl: "https://www.netflix.com",
    cancellationUrl: "https://www.netflix.com/cancelplan",
    createdAt: "2026-03-01",
  },
  {
    id: "sub-spotify",
    name: "Spotify",
    price: 980,
    currency: "JPY",
    billingCycle: "monthly",
    nextBillingDate: "2026-07-11",
    categoryId: "cat-music",
    paymentMethodId: "pay-paypay",
    status: "active",
    notifyDaysBefore: 3,
    usageFrequency: "medium",
    createdAt: "2026-02-11",
  },
  {
    id: "sub-chatgpt",
    name: "ChatGPT Plus",
    price: 3200,
    currency: "JPY",
    billingCycle: "monthly",
    nextBillingDate: "2026-07-02",
    categoryId: "cat-work",
    paymentMethodId: "pay-visa",
    status: "active",
    notifyDaysBefore: 7,
    usageFrequency: "high",
    memo: "業務利用",
    createdAt: "2026-01-20",
  },
  {
    id: "sub-adobe",
    name: "Adobe Creative Cloud",
    price: 77880,
    currency: "JPY",
    billingCycle: "yearly",
    nextBillingDate: "2026-10-18",
    categoryId: "cat-work",
    paymentMethodId: "pay-visa",
    status: "active",
    notifyDaysBefore: 7,
    usageFrequency: "low",
    createdAt: "2025-10-18",
  },
  {
    id: "sub-storage",
    name: "Cloud Storage Pro",
    price: 1200,
    currency: "JPY",
    billingCycle: "monthly",
    nextBillingDate: "2026-07-26",
    categoryId: "cat-cloud",
    paymentMethodId: "pay-bank",
    status: "paused",
    notifyDaysBefore: 1,
    usageFrequency: "low",
    createdAt: "2026-04-07",
  },
];