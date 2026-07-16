import type { AccountRecord, Category, ContactMessage, PaymentMethod, SiteSettings, Subscription, UserAccount } from "./types";

export type PersistedState = {
  user: UserAccount;
  accounts: AccountRecord[];
  siteSettings: SiteSettings;
  contactMessages: ContactMessage[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  subscriptions: Subscription[];
};