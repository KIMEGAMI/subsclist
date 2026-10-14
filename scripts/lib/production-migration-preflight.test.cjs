/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { assertSafeMigrationSnapshot } = require("./production-migration-preflight.cjs");
const {
  databaseConfig,
  inspectMigrationSnapshot,
} = require("../preflight-production-migrations.cjs");
const {
  assertProductionEnvironment,
  ProductionEnvironmentError,
} = require("./production-env-guard.cjs");

const migrationNames = {
  alternatives: "20260630020000_remove_manual_alternatives",
  stripeIds: "20260813030000_add_unique_stripe_identifiers",
  savings: "20260920070000_add_savings_events",
  dedupe: "20260920080000_add_savings_event_dedupe_key",
};

function stripeSecret(mode = "live") {
  return ["sk", mode, "unitfixture"].join("_");
}

function safeSnapshot() {
  return {
    appliedMigrations: [migrationNames.savings],
    pendingMigrations: [],
    failedMigrations: [],
    maintenanceModeEnabled: true,
    alternativeColumns: [],
    alternativeNameRows: 0,
    alternativePriceRows: 0,
    stripeUniqueIndexes: [],
    duplicateStripeCustomerGroups: 0,
    duplicateStripeSubscriptionGroups: 0,
    savingsTableExists: true,
    savingsDedupeColumnExists: false,
  };
}

function migrationConnection(overrides = {}) {
  const calls = [];
  const migrationRows = [
    {
      migration_name: migrationNames.savings,
      started_at: new Date(),
      finished_at: new Date(),
      rolled_back_at: null,
    },
  ];
  const connection = {
    calls,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes("FROM `_prisma_migrations`")) return migrationRows;
      if (sql.includes("FROM `AppSetting`")) return [{ value: "enabled" }];
      if (sql.includes("FROM information_schema.COLUMNS") && parameters[0] === "Subscription") {
        return [{ COLUMN_NAME: "alternativeName" }, { COLUMN_NAME: "alternativeMonthlyPrice" }];
      }
      if (sql.includes("SUM(`alternativeName`")) {
        return [{ nameRows: overrides.alternativeNameRows ?? 0, priceRows: overrides.alternativePriceRows ?? 0 }];
      }
      if (sql.includes("FROM information_schema.STATISTICS")) return overrides.stripeIndexes ?? [];
      if (sql.includes("identifierType")) return overrides.stripeDuplicates ?? [];
      if (sql.includes("FROM information_schema.TABLES")) return [{ TABLE_NAME: "SavingsEvent" }];
      if (sql.includes("FROM information_schema.COLUMNS") && parameters[0] === "SavingsEvent") {
        return overrides.savingsDedupeColumn ? [{ COLUMN_NAME: "dedupeKey" }] : [];
      }
      throw new Error("Unexpected query in migration preflight test.");
    },
  };
  return connection;
}

function validProductionEnvironment(overrides = {}) {
  return {
    APP_URL: "https://subsclist.kimegami.jp",
    DATABASE_URL: "mysql://deploy@db.example.invalid:3306/subsclist",
    AUTH_SECRET: "a".repeat(32),
    STRIPE_SECRET_KEY: stripeSecret(),
    STRIPE_LIVE_MODE_ALLOWED: "true",
    STRIPE_WEBHOOK_SECRET: "whsec_unitfixture",
    STRIPE_PREMIUM_PRICE_ID: "price_unitfixture",
    RESEND_API_KEY: "re_unitfixture",
    RESEND_FROM: "SubscList <noreply@subsclist.kimegami.jp>",
    GOOGLE_CLIENT_ID: "google-client-fixture",
    GOOGLE_CLIENT_SECRET: "google-secret-fixture",
    NOTIFICATION_JOB_SECRET: "n".repeat(32),
    ...overrides,
  };
}

test("safe migration snapshot passes", () => {
  assert.doesNotThrow(() => assertSafeMigrationSnapshot(safeSnapshot()));
});

test("production preflight rejects test database URLs", () => {
  assert.throws(
    () => databaseConfig("mysql://localhost:3306/subsclist_test"),
    /production MySQL/,
  );
  assert.throws(
    () => databaseConfig("mysql://localhost:3306/subsclist_ci"),
    /production MySQL/,
  );
  assert.equal(
    databaseConfig("mysql://db.example.invalid:3306/subsclist").database,
    "subsclist",
  );
});

test("production environment accepts configured live billing and delivery services", () => {
  assert.doesNotThrow(() =>
    assertProductionEnvironment(validProductionEnvironment()),
  );
});

test("Google OAuth may be disabled only when both credentials are omitted", () => {
  const environment = validProductionEnvironment();
  delete environment.GOOGLE_CLIENT_ID;
  delete environment.GOOGLE_CLIENT_SECRET;
  assert.doesNotThrow(() => assertProductionEnvironment(environment));
  assert.throws(
    () =>
      assertProductionEnvironment(
        validProductionEnvironment({ GOOGLE_CLIENT_SECRET: "" }),
      ),
    /both Google OAuth credentials/,
  );
});

test("missing production environment settings name keys without exposing values", () => {
  const environment = validProductionEnvironment();
  delete environment.DATABASE_URL;
  assert.throws(
    () => assertProductionEnvironment(environment),
    (error) =>
      error instanceof ProductionEnvironmentError &&
      error.message === "DATABASE_URL must be configured." &&
      !error.message.includes("db.example.invalid"),
  );
});

test("production environment uses the same nullish alias precedence as the app", () => {
  const fallbackEnvironment = validProductionEnvironment();
  delete fallbackEnvironment.AUTH_SECRET;
  fallbackEnvironment.NEXTAUTH_SECRET = "n".repeat(32);
  delete fallbackEnvironment.STRIPE_SECRET_KEY;
  fallbackEnvironment.STRIPE_SECRET = stripeSecret();
  fallbackEnvironment.RESEND_API_KEY = "";
  fallbackEnvironment.SMTP_HOST = "smtp.gmail.com";
  fallbackEnvironment.SMTP_USER = "mail-user-fixture";
  fallbackEnvironment.SMTP_PASS = "mail-password-fixture";
  assert.doesNotThrow(() => assertProductionEnvironment(fallbackEnvironment));

  assert.throws(
    () =>
      assertProductionEnvironment(
        validProductionEnvironment({
          AUTH_SECRET: "",
          NEXTAUTH_SECRET: "n".repeat(32),
        }),
      ),
    /AUTH_SECRET or NEXTAUTH_SECRET/,
  );
  assert.throws(
    () =>
      assertProductionEnvironment(
        validProductionEnvironment({
          STRIPE_SECRET_KEY: "",
          STRIPE_SECRET: stripeSecret(),
        }),
      ),
    /STRIPE_SECRET_KEY or STRIPE_SECRET/,
  );
  assert.throws(
    () =>
      assertProductionEnvironment(
        validProductionEnvironment({
          RESEND_API_KEY: "",
          MAIL_HOST: "",
          SMTP_HOST: "smtp.gmail.com",
          MAIL_USERNAME: "",
          SMTP_USER: "mail-user-fixture",
          MAIL_PASSWORD: "",
          SMTP_PASS: "mail-password-fixture",
        }),
      ),
    /MAIL_HOST or SMTP_HOST/,
  );
});

test("production environment rejects placeholder email credentials", () => {
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ RESEND_API_KEY: "re_replace" })),
    /RESEND_API_KEY must be a configured Resend API key/,
  );

  assert.throws(
    () =>
      assertProductionEnvironment(
        validProductionEnvironment({
          RESEND_API_KEY: "",
          SMTP_HOST: "smtp.gmail.com",
          SMTP_USER: "your-smtp-address@example.com",
          SMTP_PASS: "your-google-app-password",
        }),
      ),
    /SMTP host, username, and password must not contain placeholder values/,
  );
});

test("production environment rejects insecure origin, short auth secret, and test billing keys", () => {
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ APP_URL: "http://subsclist.kimegami.jp" })),
    /public HTTPS origin/,
  );
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ AUTH_SECRET: "short" })),
    /AUTH_SECRET/,
  );
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ STRIPE_SECRET_KEY: stripeSecret("test") })),
    /Live secret key/,
  );
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ STRIPE_LIVE_MODE_ALLOWED: "false" })),
    /STRIPE_LIVE_MODE_ALLOWED/,
  );
});

test("production environment rejects IP literals and local-only hostnames", () => {
  for (const APP_URL of [
    "https://127.0.0.1",
    "https://10.0.0.12",
    "https://[::1]",
    "https://localhost.localdomain",
    "https://app.localhost",
    "https://service.internal",
    "https://app.test",
    "https://intranet",
  ]) {
    assert.throws(
      () => assertProductionEnvironment(validProductionEnvironment({ APP_URL })),
      /public HTTPS origin/,
      APP_URL,
    );
  }
});

test("production environment rejects a Stripe API key used as webhook secret", () => {
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ STRIPE_WEBHOOK_SECRET: stripeSecret() })),
    /webhook signing secret/,
  );
});

test("configured news job secrets reject short and example values", () => {
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ NEWS_JOB_SECRET: "short" })),
    /NEWS_JOB_SECRET/,
  );
  assert.throws(
    () => assertProductionEnvironment(validProductionEnvironment({ NEWS_JOB_SECRET: "replace-with-random-secret-for-daily-news" })),
    /NEWS_JOB_SECRET/,
  );
  assert.doesNotThrow(() => assertProductionEnvironment(validProductionEnvironment({ NEWS_JOB_SECRET: "n".repeat(32) })));
});

test("migration deploy is blocked unless maintenance mode is enabled", () => {
  const snapshot = safeSnapshot();
  snapshot.maintenanceModeEnabled = false;
  assert.throws(() => assertSafeMigrationSnapshot(snapshot), /maintenance mode/);
});

test("pending column removal is blocked when any existing value would be lost", () => {
  const snapshot = safeSnapshot();
  snapshot.pendingMigrations = [migrationNames.alternatives];
  snapshot.alternativeColumns = ["alternativeName", "alternativeMonthlyPrice"];
  snapshot.alternativeNameRows = 1;
  assert.throws(() => assertSafeMigrationSnapshot(snapshot), /existing values/);
});

test("pending unique Stripe indexes are blocked for duplicate identifiers", () => {
  const snapshot = safeSnapshot();
  snapshot.pendingMigrations = [migrationNames.stripeIds];
  snapshot.duplicateStripeCustomerGroups = 1;
  assert.throws(() => assertSafeMigrationSnapshot(snapshot), /duplicate Stripe identifiers/);
});

test("pending dedupe key migration allows existing rows to receive deterministic legacy keys", () => {
  const snapshot = safeSnapshot();
  snapshot.pendingMigrations = [migrationNames.dedupe];
  snapshot.appliedMigrations = [migrationNames.savings];
  snapshot.savingsTableExists = true;
  assert.doesNotThrow(() => assertSafeMigrationSnapshot(snapshot));
});

test("dedupe migration preserves existing rows with unique legacy keys before enforcing constraints", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const migration = fs.readFileSync(
    path.join(__dirname, "../../prisma/migrations/20260920080000_add_savings_event_dedupe_key/migration.sql"),
    "utf8",
  );
  const addNullable = migration.indexOf("ADD COLUMN `dedupeKey` VARCHAR(191) NULL");
  const backfill = migration.indexOf("CONCAT('legacy:', SHA2(`id`, 256))");
  const requireValue = migration.indexOf("MODIFY `dedupeKey` VARCHAR(191) NOT NULL");
  const uniqueIndex = migration.indexOf("CREATE UNIQUE INDEX `SavingsEvent_dedupeKey_key`");

  assert.ok(addNullable >= 0 && backfill > addNullable);
  assert.ok(requireValue > backfill && uniqueIndex > requireValue);
});

test("unresolved failed migrations stop the deployment preflight", () => {
  const snapshot = safeSnapshot();
  snapshot.failedMigrations = [migrationNames.alternatives];
  assert.throws(() => assertSafeMigrationSnapshot(snapshot), /Unresolved migration state/);
});

test("partial or unexpected migration state fails closed", () => {
  const snapshot = safeSnapshot();
  snapshot.pendingMigrations = [migrationNames.dedupe];
  snapshot.appliedMigrations = [];
  snapshot.savingsTableExists = true;
  assert.throws(() => assertSafeMigrationSnapshot(snapshot), /table state/);
});

test("database inspection uses read-only queries and passes clean migration state", async () => {
  const connection = migrationConnection();
  const snapshot = await inspectMigrationSnapshot(connection);
  assertSafeMigrationSnapshot(snapshot);
  assert.equal(snapshot.maintenanceModeEnabled, true);
  assert.ok(connection.calls.length > 0);
  assert.ok(connection.calls.every(({ sql }) => /^\s*SELECT\b/i.test(sql)));
});

test("database inspection forwards existing values and duplicates to the safety checks", async () => {
  const alternatives = await inspectMigrationSnapshot(
    migrationConnection({ alternativeNameRows: 1 }),
  );
  assert.throws(() => assertSafeMigrationSnapshot(alternatives), /existing values/);

  const stripe = await inspectMigrationSnapshot(
    migrationConnection({ stripeDuplicates: [{ identifierType: "customer", duplicateGroups: 2 }] }),
  );
  assert.throws(() => assertSafeMigrationSnapshot(stripe), /duplicate Stripe identifiers/);

  const savings = await inspectMigrationSnapshot(migrationConnection());
  assert.doesNotThrow(() => assertSafeMigrationSnapshot(savings));
});
