import {
  DEFAULT_ADMIN_USER_EMAIL,
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_DEMO_USER_EMAIL,
  DEFAULT_GEMINI_MODEL,
} from "@/lib/app-constants";
import {
  isStripeLiveModeAllowed,
  isStripeServerSecretKey,
  STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR,
} from "@/lib/stripe-secret-key";
import { isAuthSecretAcceptable } from "@/lib/auth-secret-policy";

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

function configuredMailFrom() {
  const explicit = process.env.RESEND_FROM?.trim();
  if (explicit) return explicit;

  const address = process.env.MAIL_FROM_ADDRESS?.trim();
  if (address) {
    const normalizedAddress = address.includes("@") ? address : `noreply@${address}`;
    const name = process.env.MAIL_FROM_NAME?.trim();
    return name ? `${name} <${normalizedAddress}>` : normalizedAddress;
  }

  return process.env.MAIL_FROM?.trim() ?? "";
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SECRET ?? "";

export const env = {
  appUrl: validAppUrl(process.env.APP_URL) ?? validAppUrl(process.env.NEXTAUTH_URL) ?? "http://localhost:3000",
  authSecret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  databaseUrl: required("DATABASE_URL"),
  mailFrom: configuredMailFrom(),
  contactEmail: process.env.CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL,
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  smtpHost: process.env.MAIL_HOST ?? process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.MAIL_PORT ?? process.env.SMTP_PORT ?? "587"),
  smtpSecure: process.env.MAIL_ENCRYPTION === "ssl" || process.env.MAIL_SECURE === "true" || process.env.SMTP_SECURE === "true",
  smtpUser: process.env.MAIL_USERNAME ?? process.env.SMTP_USER ?? "",
  smtpPass: process.env.MAIL_PASSWORD ?? process.env.SMTP_PASS ?? "",
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? DEFAULT_DEMO_USER_EMAIL,
  adminUserEmail: process.env.ADMIN_USER_EMAIL ?? "",
  notificationJobSecret: process.env.NOTIFICATION_JOB_SECRET ?? "",
  newsJobSecret: process.env.NEWS_JOB_SECRET ?? "",
  stripeSecretKey,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "",
  stripePortalConfigurationId: process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? "",
  stripeTestMode: stripeSecretKey.startsWith("sk_test_"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
};

export function assertAuthSecret() {
  if (!isAuthSecretAcceptable(env.authSecret)) {
    throw new Error(
      "AUTH_SECRETまたはNEXTAUTH_SECRETは32文字以上のランダムな値を設定してください。説明用の置換文字列は使用できません。",
    );
  }
}

export function assertMailEnv() {
  if (!env.mailFrom) throw new Error("MAIL_FROMが設定されていません。");
  if (env.resendApiKey) return;
  if (!env.smtpHost) throw new Error("MAIL_HOSTまたはSMTP_HOSTが設定されていません。");
  if (!env.smtpUser) throw new Error("MAIL_USERNAMEまたはSMTP_USERが設定されていません。");
  if (!env.smtpPass) throw new Error("MAIL_PASSWORDまたはSMTP_PASSが設定されていません。");
}

export function assertStripeEnv() {
  if (!env.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!isStripeServerSecretKey(env.stripeSecretKey)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe server-side secret key (sk_test_... or sk_live_...).");
  }
  if (
    !isStripeLiveModeAllowed(
      env.stripeSecretKey,
      process.env.STRIPE_LIVE_MODE_ALLOWED,
      process.env.NODE_ENV,
    )
  ) {
    throw new Error(
      STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR,
    );
  }
}

export function assertStripeWebhookEnv() {
  assertStripeEnv();
  if (!env.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
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

export function assertGeminiEnv() {
  if (!env.geminiApiKey) {
    throw new Error("GEMINI_API_KEYが設定されていません。");
  }
  if (!/^gemini-[a-z0-9.-]+$/.test(env.geminiModel)) {
    throw new Error("GEMINI_MODELの形式が正しくありません。");
  }
}
