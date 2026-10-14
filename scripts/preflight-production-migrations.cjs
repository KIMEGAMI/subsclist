/* eslint-disable @typescript-eslint/no-require-imports */
const mariadb = require("mariadb");
const {
  assertProductionEnvironment,
  ProductionEnvironmentError,
} = require("./lib/production-env-guard.cjs");
const {
  assertSafeMigrationSnapshot,
  MigrationPreflightBlockedError,
} = require("./lib/production-migration-preflight.cjs");

const migrationNames = [
  "20260630020000_remove_manual_alternatives",
  "20260813030000_add_unique_stripe_identifiers",
  "20260920070000_add_savings_events",
  "20260920080000_add_savings_event_dedupe_key",
];

function databaseConfig(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    url.protocol !== "mysql:" ||
    !database ||
    /_(?:test|ci)$/i.test(database)
  ) {
    throw new Error("DATABASE_URL is not a production MySQL database URL.");
  }

  const config = {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
  };

  const allowPublicKeyRetrieval = url.searchParams.get("allowPublicKeyRetrieval");
  if (allowPublicKeyRetrieval) {
    config.allowPublicKeyRetrieval = allowPublicKeyRetrieval === "true";
  }
  const cachingRsaPublicKey = url.searchParams.get("cachingRsaPublicKey");
  if (cachingRsaPublicKey) config.cachingRsaPublicKey = cachingRsaPublicKey;
  return config;
}

async function inspectMigrationSnapshot(connection) {
  const migrationRows = await connection.query(
    "SELECT migration_name, started_at, finished_at, rolled_back_at FROM `_prisma_migrations`",
  );
  const migrations = new Map(
    migrationRows.map((row) => [row.migration_name, row]),
  );
  const failedMigrations = migrationRows
    .filter((row) => row.started_at && !row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name);
  const appliedMigrations = migrationRows
    .filter((row) => row.finished_at)
    .map((row) => row.migration_name);
  const pendingMigrations = migrationNames.filter((name) => {
    const migration = migrations.get(name);
    return !migration || Boolean(migration.rolled_back_at);
  });

  const snapshot = {
    appliedMigrations,
    pendingMigrations,
    failedMigrations,
    maintenanceModeEnabled: false,
    alternativeColumns: [],
    alternativeNameRows: 0,
    alternativePriceRows: 0,
    stripeUniqueIndexes: [],
    duplicateStripeCustomerGroups: 0,
    duplicateStripeSubscriptionGroups: 0,
    savingsTableExists: false,
    savingsDedupeColumnExists: false,
  };

  const maintenanceSettings = await connection.query(
    "SELECT `value` FROM `AppSetting` WHERE `key` = ? LIMIT 1",
    ["maintenanceMode"],
  );
  snapshot.maintenanceModeEnabled = maintenanceSettings[0]?.value === "enabled";

  if (pendingMigrations.includes("20260630020000_remove_manual_alternatives")) {
    const columns = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)",
      ["Subscription", "alternativeName", "alternativeMonthlyPrice"],
    );
    snapshot.alternativeColumns = columns.map((column) => column.COLUMN_NAME);
    if (snapshot.alternativeColumns.length === 2) {
      const counts = await connection.query(
        "SELECT SUM(`alternativeName` IS NOT NULL) AS nameRows, SUM(`alternativeMonthlyPrice` IS NOT NULL) AS priceRows FROM `Subscription`",
      );
      snapshot.alternativeNameRows = Number(counts[0].nameRows ?? 0);
      snapshot.alternativePriceRows = Number(counts[0].priceRows ?? 0);
    }
  }

  if (pendingMigrations.includes("20260813030000_add_unique_stripe_identifiers")) {
    const indexes = await connection.query(
      "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME IN (?, ?)",
      ["User", "User_stripeCustomerId_key", "User_stripeSubscriptionId_key"],
    );
    snapshot.stripeUniqueIndexes = indexes.map((index) => index.INDEX_NAME);
    const duplicates = await connection.query(
      "SELECT identifierType, COUNT(*) AS duplicateGroups FROM (SELECT 'customer' AS identifierType, `stripeCustomerId` AS identifier FROM `User` WHERE `stripeCustomerId` IS NOT NULL UNION ALL SELECT 'subscription' AS identifierType, `stripeSubscriptionId` AS identifier FROM `User` WHERE `stripeSubscriptionId` IS NOT NULL) AS identifiers GROUP BY identifierType, identifier HAVING COUNT(*) > 1",
    );
    for (const duplicate of duplicates) {
      if (duplicate.identifierType === "customer") {
        snapshot.duplicateStripeCustomerGroups = Number(duplicate.duplicateGroups);
      } else if (duplicate.identifierType === "subscription") {
        snapshot.duplicateStripeSubscriptionGroups = Number(duplicate.duplicateGroups);
      }
    }
  }

  if (pendingMigrations.includes("20260920080000_add_savings_event_dedupe_key")) {
    const tables = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      ["SavingsEvent"],
    );
    snapshot.savingsTableExists = tables.length > 0;
    if (snapshot.savingsTableExists) {
      const columns = await connection.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
        ["SavingsEvent", "dedupeKey"],
      );
      snapshot.savingsDedupeColumnExists = columns.length > 0;
    }
  }

  return snapshot;
}

async function main() {
  if (process.env.PRODUCTION_MIGRATION_PREFLIGHT !== "1") {
    throw new Error("Run this check only from the approved production deployment workflow.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  assertProductionEnvironment(process.env);

  const connection = await mariadb.createConnection(
    databaseConfig(process.env.DATABASE_URL),
  );
  try {
    const snapshot = await inspectMigrationSnapshot(connection);
    assertSafeMigrationSnapshot(snapshot);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main()
    .then(() => console.log("Production migration preflight passed."))
    .catch((error) => {
      if (error instanceof ProductionEnvironmentError) {
        console.error(`Production deployment environment blocked: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      if (error instanceof MigrationPreflightBlockedError) {
        console.error(`Production migration preflight blocked: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.error("Production migration preflight blocked. Review migration history and aggregate data checks before retrying.");
      process.exitCode = 1;
    });
}

module.exports = { databaseConfig, inspectMigrationSnapshot };
