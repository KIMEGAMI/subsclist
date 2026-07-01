function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が設定されていません。`);
  }
  return value;
}

export const env = {
  appUrl: process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  authSecret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  databaseUrl: required("DATABASE_URL"),
  mailFrom: process.env.MAIL_FROM ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  demoUserEmail: process.env.DEMO_USER_EMAIL ?? "",
  notificationJobSecret: process.env.NOTIFICATION_JOB_SECRET ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePremiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID ?? "",
};

export function assertAuthSecret() {
  if (env.authSecret.length < 32) {
    throw new Error("AUTH_SECRET または NEXTAUTH_SECRET は32文字以上で設定してください。");
  }
}

export function assertMailEnv() {
  for (const name of ["MAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name} が設定されていません。`);
    }
  }
}

export function assertStripeEnv() {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_PREMIUM_PRICE_ID"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name} が設定されていません。`);
    }
  }
}

export function assertStripeWebhookEnv() {
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
    if (!process.env[name]) {
      throw new Error(`${name} が設定されていません。`);
    }
  }
}
