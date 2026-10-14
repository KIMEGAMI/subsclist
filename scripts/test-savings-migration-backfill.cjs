/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");
const { testDatabaseConfig } = require("./lib/test-database-config.cjs");

async function applyMigration(connection, name, expectedStatementCount) {
  const migrationPath = path.join(__dirname, "../prisma/migrations", name, "migration.sql");
  const statements = fs
    .readFileSync(migrationPath, "utf8")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert.equal(statements.length, expectedStatementCount, `${name} statement count changed.`);
  for (const statement of statements) await connection.query(statement);
}

function databaseDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function main() {
  const connection = await mariadb.createConnection(testDatabaseConfig());
  try {
    await connection.query(
      "CREATE TEMPORARY TABLE `Subscription` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `name` VARCHAR(100) NOT NULL, `categoryId` VARCHAR(191) NULL, `paymentMethodId` VARCHAR(191) NULL, `nextBillingDate` DATE NULL) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `Category` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `name` VARCHAR(50) NOT NULL) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `PaymentMethod` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `name` VARCHAR(50) NOT NULL) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `SavingChallenge` (`id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `subscriptionId` VARCHAR(191) NOT NULL, `year` INTEGER NOT NULL, `month` INTEGER NOT NULL, `status` VARCHAR(32) NOT NULL, `potentialMonthlySaving` INTEGER NOT NULL, `createdAt` DATETIME(3) NOT NULL, `updatedAt` DATETIME(3) NOT NULL, UNIQUE INDEX `SavingChallenge_userId_year_month_key` (`userId`, `year`, `month`), INDEX `SavingChallenge_subscriptionId_idx` (`subscriptionId`), INDEX `SavingChallenge_userId_idx` (`userId`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `PaymentHistory` (`id` VARCHAR(191) NOT NULL PRIMARY KEY, `subscriptionId` VARCHAR(191) NOT NULL) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `StripeWebhookEvent` (`id` VARCHAR(255) NOT NULL PRIMARY KEY, `type` VARCHAR(100) NOT NULL, `createdAt` DATETIME(3) NOT NULL, `processedAt` DATETIME(3) NULL, INDEX `StripeWebhookEvent_processedAt_idx` (`processedAt`)) ENGINE=InnoDB",
    );
    await connection.query(
      "CREATE TEMPORARY TABLE `SavingsEvent` (`id` VARCHAR(191) NOT NULL PRIMARY KEY) ENGINE=InnoDB",
    );

    await connection.query(
      "INSERT INTO `Subscription` (`id`, `name`, `categoryId`, `paymentMethodId`, `nextBillingDate`) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      [
        "sub-anchored", "動画", null, null, "2026-02-28",
        "sub-no-date", "音楽", null, null, null,
        "sub-snapshot", "クラウド", "cat-1", "method-1", "2026-03-01",
      ],
    );
    await connection.query(
      "INSERT INTO `SavingChallenge` (`id`, `userId`, `subscriptionId`, `year`, `month`, `status`, `potentialMonthlySaving`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "decision-anchored", "user-1", "sub-anchored", 2026, 1, "PENDING", 500,
        "2026-01-01 00:00:00.000", "2026-01-01 00:00:00.000",
        "decision-created", "user-2", "sub-no-date", 2026, 1, "PENDING", 300,
        "2026-01-15 12:30:00.000", "2026-01-15 12:30:00.000",
      ],
    );
    await connection.query("INSERT INTO `Category` (`id`, `name`) VALUES (?, ?)", ["cat-1", "仕事"]);
    await connection.query("INSERT INTO `PaymentMethod` (`id`, `name`) VALUES (?, ?)", ["method-1", "カード"]);
    await connection.query("INSERT INTO `PaymentHistory` (`id`, `subscriptionId`) VALUES (?, ?)", ["payment-1", "sub-snapshot"]);
    const webhookCreatedAt = "2026-04-05 06:07:08.123";
    await connection.query(
      "INSERT INTO `StripeWebhookEvent` (`id`, `type`, `createdAt`) VALUES (?, ?, ?)",
      ["evt-existing", "invoice.paid", webhookCreatedAt],
    );
    const savingsIds = ["existing-event-one", "existing-event-two"];
    for (const id of savingsIds) {
      await connection.query("INSERT INTO `SavingsEvent` (`id`) VALUES (?)", [id]);
    }

    await applyMigration(connection, "20260828040000_extend_renewal_decisions", 7);
    const decisions = await connection.query(
      "SELECT `id`, `renewalDate` FROM `SavingChallenge` ORDER BY `id`",
    );
    assert.deepEqual(
      decisions.map((row) => [row.id, databaseDate(row.renewalDate)]),
      [["decision-anchored", "2026-02-28"], ["decision-created", "2026-01-15"]],
    );
    await connection.query(
      "INSERT INTO `SavingChallenge` (`id`, `userId`, `subscriptionId`, `year`, `month`, `status`, `potentialMonthlySaving`, `createdAt`, `updatedAt`, `renewalDate`, `decidedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["decision-second-subscription", "user-1", "sub-second", 2026, 1, "PENDING", 100, "2026-01-01", "2026-01-01", "2026-01-20", "2026-01-20"],
    );
    const decisionIndexes = await connection.query("SHOW INDEX FROM `SavingChallenge`");
    assert.equal(decisionIndexes.some((row) => row.Key_name === "SavingChallenge_userId_year_month_key"), false);
    assert.equal(decisionIndexes.some((row) => row.Key_name === "SavingChallenge_userId_subscriptionId_year_month_key"), true);
    assert.equal(decisionIndexes.some((row) => row.Key_name === "SavingChallenge_userId_idx"), false);

    await applyMigration(connection, "20260828050000_add_payment_history_snapshots", 3);
    const snapshots = await connection.query(
      "SELECT `subscriptionNameSnapshot`, `categoryNameSnapshot`, `paymentMethodNameSnapshot` FROM `PaymentHistory` WHERE `id` = ?",
      ["payment-1"],
    );
    assert.deepEqual(
      [snapshots[0]?.subscriptionNameSnapshot, snapshots[0]?.categoryNameSnapshot, snapshots[0]?.paymentMethodNameSnapshot],
      ["クラウド", "仕事", "カード"],
    );
    const snapshotColumn = await connection.query("SHOW COLUMNS FROM `PaymentHistory` LIKE 'subscriptionNameSnapshot'");
    assert.equal(snapshotColumn[0]?.Null, "NO");

    await applyMigration(connection, "20261010040000_recover_stuck_stripe_webhooks", 3);
    const webhookRows = await connection.query(
      "SELECT `createdAt`, `processingStartedAt` FROM `StripeWebhookEvent` WHERE `id` = ?",
      ["evt-existing"],
    );
    assert.equal(webhookRows[0].processingStartedAt.getTime(), webhookRows[0].createdAt.getTime());
    await connection.query(
      "INSERT INTO `StripeWebhookEvent` (`id`, `type`, `createdAt`) VALUES (?, ?, ?)",
      ["evt-new", "invoice.paid", "2026-04-06 07:08:09.123"],
    );
    const newWebhook = await connection.query(
      "SELECT `processingStartedAt` FROM `StripeWebhookEvent` WHERE `id` = ?",
      ["evt-new"],
    );
    assert.ok(newWebhook[0]?.processingStartedAt instanceof Date);

    await applyMigration(connection, "20260920080000_add_savings_event_dedupe_key", 4);
    const savingsRows = await connection.query(
      "SELECT `id`, `dedupeKey` FROM `SavingsEvent` ORDER BY `id`",
    );
    assert.deepEqual(
      savingsRows.map((row) => [row.id, row.dedupeKey]),
      savingsIds.toSorted().map((id) => [id, `legacy:${crypto.createHash("sha256").update(id).digest("hex")}`]),
    );
    const dedupeColumn = await connection.query("SHOW COLUMNS FROM `SavingsEvent` LIKE 'dedupeKey'");
    assert.equal(dedupeColumn[0]?.Null, "NO");
    const dedupeIndex = await connection.query("SHOW INDEX FROM `SavingsEvent` WHERE Key_name = ?", ["SavingsEvent_dedupeKey_key"]);
    assert.equal(Number(dedupeIndex[0]?.Non_unique), 0);
    await assert.rejects(
      connection.query("INSERT INTO `SavingsEvent` (`id`, `dedupeKey`) VALUES (?, ?)", ["duplicate-event", savingsRows[0].dedupeKey]),
      (error) => error.code === "ER_DUP_ENTRY",
    );

    console.log("Four production migration backfills passed using connection-scoped temporary tables.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Production migration backfill tests failed.");
  process.exitCode = 1;
});
