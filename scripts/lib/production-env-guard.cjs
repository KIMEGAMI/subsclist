function requiredValue(environment, names) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  block(`${names.join(" or ")} must be configured.`);
}

function runtimeSelectedValue(environment, names) {
  const selectedName = names.find((name) => environment[name] !== undefined);
  const value = selectedName ? environment[selectedName]?.trim() ?? "" : "";
  if (!value) block(`${names.join(" or ")} must be configured.`);
  return value;
}

class ProductionEnvironmentError extends Error {}

function block(message) {
  throw new ProductionEnvironmentError(message);
}

function hasPlaceholder(value) {
  return /(?:replace|placeholder|change[-_ ]?me|your[-_ ]?(?:secret|token|password|api[-_]?key|smtp|email|address)|example\.(?:com|invalid|test))/i.test(value);
}

function isAcceptableJobSecret(value) {
  return Buffer.byteLength(value, "utf8") >= 32
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value) // eslint-disable-line no-control-regex -- rejects unsafe control characters
    && !hasPlaceholder(value);
}

function isNonPublicHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  const localSuffixes = [
    ".localhost",
    ".local",
    ".internal",
    ".test",
    ".invalid",
    ".example",
    ".localdomain",
  ];
  return (
    !normalized.includes(".") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) ||
    normalized.startsWith("[") ||
    normalized === "localhost" ||
    localSuffixes.some((suffix) => normalized.endsWith(suffix))
  );
}

function assertProductionEnvironment(environment) {
  const appUrl = new URL(requiredValue(environment, ["APP_URL", "NEXTAUTH_URL"]));
  if (
    appUrl.protocol !== "https:" ||
    isNonPublicHostname(appUrl.hostname) ||
    hasPlaceholder(appUrl.hostname)
  ) {
    block("APP_URL or NEXTAUTH_URL must be the public HTTPS origin.");
  }

  const databaseUrl = new URL(requiredValue(environment, ["DATABASE_URL"]));
  const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (
    databaseUrl.protocol !== "mysql:" ||
    !database ||
    /_(?:test|ci)$/i.test(database)
  ) {
    block("DATABASE_URL must target the production MySQL database.");
  }

  const authSecret = runtimeSelectedValue(environment, ["AUTH_SECRET", "NEXTAUTH_SECRET"]);
  if (authSecret.length < 32 || hasPlaceholder(authSecret)) {
    block("AUTH_SECRET or NEXTAUTH_SECRET must be a non-placeholder secret of at least 32 characters.");
  }

  const stripeSecret = runtimeSelectedValue(environment, ["STRIPE_SECRET_KEY", "STRIPE_SECRET"]);
  if (!stripeSecret.startsWith("sk_live_") || hasPlaceholder(stripeSecret)) {
    block("A production Stripe Live secret key must be configured.");
  }
  if (environment.STRIPE_LIVE_MODE_ALLOWED !== "true") {
    block("STRIPE_LIVE_MODE_ALLOWED must be true for production billing.");
  }

  const webhookSecret = requiredValue(environment, ["STRIPE_WEBHOOK_SECRET"]);
  if (
    !webhookSecret.startsWith("whsec_") ||
    hasPlaceholder(webhookSecret) ||
    webhookSecret === stripeSecret
  ) {
    block("STRIPE_WEBHOOK_SECRET must be the distinct production webhook signing secret.");
  }

  const priceId = requiredValue(environment, ["STRIPE_PREMIUM_PRICE_ID"]);
  if (!priceId.startsWith("price_") || hasPlaceholder(priceId)) {
    block("STRIPE_PREMIUM_PRICE_ID must be the production recurring Price ID.");
  }

  const mailFrom = requiredValue(environment, ["RESEND_FROM", "MAIL_FROM_ADDRESS", "MAIL_FROM"]);
  if (hasPlaceholder(mailFrom)) {
    block("A verified production mail sender must be configured.");
  }
  const resendApiKey = environment.RESEND_API_KEY?.trim() ?? "";
  if (resendApiKey) {
    if (!resendApiKey.startsWith("re_") || hasPlaceholder(resendApiKey)) {
      block("RESEND_API_KEY must be a configured Resend API key, not a placeholder.");
    }
  } else {
    const smtpHost = runtimeSelectedValue(environment, ["MAIL_HOST", "SMTP_HOST"]);
    const smtpUsername = runtimeSelectedValue(environment, ["MAIL_USERNAME", "SMTP_USER"]);
    const smtpPassword = runtimeSelectedValue(environment, ["MAIL_PASSWORD", "SMTP_PASS"]);
    if ([smtpHost, smtpUsername, smtpPassword].some(hasPlaceholder)) {
      block("SMTP host, username, and password must not contain placeholder values.");
    }
  }

  const googleClientId = environment.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = environment.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    block("Configure both Google OAuth credentials or omit both to disable Google login.");
  }
  const notificationSecret = requiredValue(environment, ["NOTIFICATION_JOB_SECRET"]);
  if (!isAcceptableJobSecret(notificationSecret)) {
    block("NOTIFICATION_JOB_SECRET must be a non-placeholder secret of at least 32 characters.");
  }

  const newsSecret = environment.NEWS_JOB_SECRET ?? "";
  if (newsSecret && !isAcceptableJobSecret(newsSecret)) {
    block("NEWS_JOB_SECRET must be a non-placeholder secret of at least 32 characters when configured.");
  }
}

module.exports = { assertProductionEnvironment, ProductionEnvironmentError };
