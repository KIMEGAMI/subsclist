import bcrypt from "bcryptjs";
import {
  defaultAccounts,
  defaultAdminUser,
  defaultCategories,
  defaultContactMessages,
  defaultPaymentMethods,
  defaultSiteSettings,
  defaultSubscriptions,
  defaultUser,
} from "./demo-data";
import type { AccountRecord } from "./types";
import type { PersistedState } from "./persisted-state";

function createDemoAccounts() {
  const userPassword = process.env.DEMO_USER_PASSWORD;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;

  if (!userPassword || !adminPassword) {
    throw new Error("DEMO_USER_PASSWORD and DEMO_ADMIN_PASSWORD must be set for demo accounts.");
  }

  const accounts: AccountRecord[] = [
    {
      ...defaultUser,
      passwordHash: bcrypt.hashSync(userPassword, 10),
    },
    {
      ...defaultAdminUser,
      passwordHash: bcrypt.hashSync(adminPassword, 10),
    },
  ];

  return accounts;
}

export function createSeedState(): PersistedState {
  return {
    user: defaultUser,
    accounts: defaultAccounts.length > 0 ? defaultAccounts : createDemoAccounts(),
    siteSettings: defaultSiteSettings,
    contactMessages: defaultContactMessages,
    categories: defaultCategories,
    paymentMethods: defaultPaymentMethods,
    subscriptions: defaultSubscriptions,
  };
}