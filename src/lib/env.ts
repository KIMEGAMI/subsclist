import { DEFAULT_ADMIN_USER_EMAIL, DEFAULT_DEMO_USER_EMAIL } from "@/lib/app-constants";

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name}が設定されていません。`);
  }
  return value;
}

function validAppUrl(value?: string) {
  if (!value || value.includes('"') || value.includes("'")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const env = {
  appUrl: validAppUrl(process.env.APP_URL) ?? validAppUrl(process.env.NEXTAUTH_URL) ?? "http://localhost:3000",
  authSecret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  databaseUrl: required("DATABASE_URL"),
  mailFrom: process.env.MAIL_FROM ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? DEFAULT_DEMO_USER_EMAIL,
  adminUserEmail: process.env.ADMIN_USER_EMAIL ?? "",
  notificationJobSecret: process.env.NOTIFICATION_JOB_SECRET ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "",
  stripePortalConfigurationId: process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? "",
  stripeTestMode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};

export function assertAuthSecret() {
  if (env.authSecret.length < 32) {
    throw new Error("AUTH_SECRETまたはNEXTAUTH_SECRETは32文字以上で設定してください。");
  }
}

export function assertMailEnv() {
  for (const name of ["MAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name}が設定されていません。`);
    }
  }
}

export function assertStripeEnv() {
  for (const name of ["STRIPE_SECRET_KEY"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name}が設定されていません。`);
    }
  }
}

export function assertStripeWebhookEnv() {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name}が設定されていません。`);
    }
  }
}

export function assertGoogleEnv() {
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name}が設定されていません。`);
    }
  }
}

export function isProtectedAccountEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const protectedEmails = [env.demoUserEmail, env.adminUserEmail || DEFAULT_ADMIN_USER_EMAIL]
    .filter(Boolean)
    .map((value) => value.trim().toLowerCase());
  return protectedEmails.includes(normalizedEmail);
}
