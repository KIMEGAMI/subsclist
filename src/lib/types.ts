export type Plan = "free" | "premium";

export type UserRole = "user" | "admin";

export type BillingCycle = "monthly" | "yearly" | "weekly" | "custom";

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type PaymentMethod = {
  id: string;
  name: string;
  type: "credit_card" | "debit_card" | "bank" | "paypay" | "apple_pay" | "google_pay" | "other";
  memo?: string;
};

export type Subscription = {
  id: string;
  name: string;
  price: number;
  currency: "JPY";
  billingCycle: BillingCycle;
  customCycleDays?: number;
  nextBillingDate: string;
  categoryId?: string;
  paymentMethodId?: string;
  memo?: string;
  serviceUrl?: string;
  cancellationUrl?: string;
  status: SubscriptionStatus;
  notifyDaysBefore?: number;
  usageFrequency: "high" | "medium" | "low";
  createdAt: string;
  deletedAt?: string;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  plan: Plan;
  emailVerified: boolean;
  role: UserRole;
};

export type AccountRecord = UserAccount & {
  passwordHash: string;
};

export type SiteSettings = {
  maintenanceMode: boolean;
};

export type ContactCategory = "general" | "billing" | "feature" | "bug" | "admin" | "other";

export type ContactStatus = "new" | "reviewing" | "resolved" | "blocked";

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  category: ContactCategory;
  subject: string;
  body: string;
  createdAt: string;
  status: ContactStatus;
  blocked: boolean;
};