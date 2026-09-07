/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");

const testPrice = 980;
const testBudget = 5_000;
const testYear = 2099;
const testMonth = 1;

function databaseUrlFromEnvironment() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((candidate) => /^\s*DATABASE_URL\s*=/.test(candidate));
  if (!line) return "";
  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
}

function databaseConfig() {
  const databaseUrl = databaseUrlFromEnvironment();
  if (!databaseUrl) throw new Error("DATABASE_URLが設定されていません。");
  const url = new URL(databaseUrl);
  const config = {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  };

  const allowPublicKeyRetrieval = url.searchParams.get("allowPublicKeyRetrieval");
  if (allowPublicKeyRetrieval) {
    config.allowPublicKeyRetrieval = allowPublicKeyRetrieval === "true";
  }

  const cachingRsaPublicKey = url.searchParams.get("cachingRsaPublicKey");
  if (cachingRsaPublicKey) {
    config.cachingRsaPublicKey = cachingRsaPublicKey;
  }

  return config;
}

function identity(label) {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    userId: `isolation_user_${label}_${suffix}`,
    email: `isolation_${label}_${suffix}@invalid.example`,
    subscriptionId: `isolation_subscription_${label}_${suffix}`,
    paymentHistoryId: `isolation_payment_${label}_${suffix}`,
  };
}

async function total(connection, query) {
  const rows = await connection.query(query);
  return Number(rows[0].total);
}

async function counts(connection) {
  return {
    users: await total(connection, "SELECT COUNT(*) AS total FROM `User`"),
    subscriptions: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `Subscription`",
    ),
    paymentHistories: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `PaymentHistory`",
    ),
    usages: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `SubscriptionUsage`",
    ),
    weeklyUsageReviews: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `WeeklyUsageReview`",
    ),
    priceHistories: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `SubscriptionPriceHistory`",
    ),
    preferences: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `UserPreference`",
    ),
    challenges: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `SavingChallenge`",
    ),
    monthlyCloses: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `MonthlyClose`",
    ),
    trustedLoginDevices: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `TrustedLoginDevice`",
    ),
    loginSecurityEvents: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `LoginSecurityEvent`",
    ),
    geminiAnalysisRequests: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `GeminiAnalysisRequest`",
    ),
    emailVerificationTokens: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `EmailVerificationToken`",
    ),
    passwordResetTokens: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `PasswordResetToken`",
    ),
    emailChangeTokens: await total(
      connection,
      "SELECT COUNT(*) AS total FROM `EmailChangeToken`",
    ),
  };
}

async function createUserData(connection, item, label) {
  const now = new Date();
  const passwordHash = randomBytes(32).toString("hex");
  await connection.query(
    "INSERT INTO `User` (id, name, email, emailVerified, passwordHash, plan, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'PREMIUM', ?, ?)",
    [
      item.userId,
      `分離テスト${label}`,
      item.email,
      now,
      passwordHash,
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `Subscription` (id, userId, name, price, currency, billingCycle, nextBillingDate, status, lastReviewedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'JPY', 'MONTHLY', ?, 'ACTIVE', ?, ?, ?)",
    [
      item.subscriptionId,
      item.userId,
      `分離テスト${label}`,
      testPrice,
      new Date("2099-01-15T00:00:00.000Z"),
      new Date("2099-01-01T00:00:00.000Z"),
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `SubscriptionUsage` (id, userId, subscriptionId, usedDate, usageCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)",
    [
      randomUUID(),
      item.userId,
      item.subscriptionId,
      new Date("2099-01-02T00:00:00.000Z"),
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `WeeklyUsageReview` (id, userId, subscriptionId, weekStart, usageRange, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'ONE_TWO', ?, ?)",
    [
      randomUUID(),
      item.userId,
      item.subscriptionId,
      new Date("2099-01-05T00:00:00.000Z"),
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `SubscriptionPriceHistory` (id, userId, subscriptionId, price, billingCycle, effectiveFrom, createdAt) VALUES (?, ?, ?, ?, 'MONTHLY', ?, ?)",
    [randomUUID(), item.userId, item.subscriptionId, testPrice, now, now],
  );
  await connection.query(
    "INSERT INTO `PaymentHistory` (id, subscriptionId, userId, amount, paidAt, subscriptionNameSnapshot, accountingLabel, referenceNumber, createdAt) VALUES (?, ?, ?, ?, ?, ?, '通信費', ?, ?)",
    [
      item.paymentHistoryId,
      item.subscriptionId,
      item.userId,
      testPrice,
      now,
      `分離テスト${label}`,
      `TEST-${label}`,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `UserPreference` (id, userId, monthlyBudget, defaultNotifyDaysBefore, notificationHour, createdAt, updatedAt) VALUES (?, ?, ?, 7, 9, ?, ?)",
    [randomUUID(), item.userId, testBudget, now, now],
  );
  await connection.query(
    "INSERT INTO `SavingChallenge` (id, userId, subscriptionId, year, month, status, potentialMonthlySaving, reason, renewalDate, decidedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'HOLD', ?, NULL, ?, ?, ?, ?)",
    [
      randomUUID(),
      item.userId,
      item.subscriptionId,
      testYear,
      testMonth,
      testPrice,
      now,
      now,
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `MonthlyClose` (id, userId, year, month, paidAmount, businessPaidAmount, activeMonthlyAmount, activeSubscriptionCount, reviewedSubscriptionCount, deadlineRiskCount, completedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)",
    [
      randomUUID(),
      item.userId,
      testYear,
      testMonth,
      testPrice,
      testPrice,
      testPrice,
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `TrustedLoginDevice` (id, userId, tokenHash, clientLabel, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      item.userId,
      randomBytes(32).toString("hex"),
      `分離テスト端末${label}`,
      now,
      now,
    ],
  );
  await connection.query(
    "INSERT INTO `LoginSecurityEvent` (id, userId, type, clientLabel, createdAt) VALUES (?, ?, 'LOGIN_SUCCESS', ?, ?)",
    [randomUUID(), item.userId, `分離テスト端末${label}`, now],
  );
  await connection.query(
    "INSERT INTO `GeminiAnalysisRequest` (id, userId, createdAt) VALUES (?, ?, ?)",
    [randomUUID(), item.userId, now],
  );
}

async function assertUserIsolation(connection, owner, other) {
  const subscriptions = await connection.query(
    "SELECT id, lastReviewedAt FROM `Subscription` WHERE userId = ? AND deletedAt IS NULL",
    [owner.userId],
  );
  const usages = await connection.query(
    "SELECT subscriptionId FROM `SubscriptionUsage` WHERE userId = ?",
    [owner.userId],
  );
  const weeklyUsageReviews = await connection.query(
    "SELECT subscriptionId FROM `WeeklyUsageReview` WHERE userId = ?",
    [owner.userId],
  );
  const priceHistories = await connection.query(
    "SELECT subscriptionId FROM `SubscriptionPriceHistory` WHERE userId = ?",
    [owner.userId],
  );
  const paymentHistories = await connection.query(
    "SELECT id, subscriptionId FROM `PaymentHistory` WHERE userId = ?",
    [owner.userId],
  );
  const preferences = await connection.query(
    "SELECT userId FROM `UserPreference` WHERE userId = ?",
    [owner.userId],
  );
  const challenges = await connection.query(
    "SELECT subscriptionId FROM `SavingChallenge` WHERE userId = ?",
    [owner.userId],
  );
  const monthlyCloses = await connection.query(
    "SELECT userId FROM `MonthlyClose` WHERE userId = ?",
    [owner.userId],
  );
  const trustedLoginDevices = await connection.query(
    "SELECT userId FROM `TrustedLoginDevice` WHERE userId = ?",
    [owner.userId],
  );
  const loginSecurityEvents = await connection.query(
    "SELECT userId FROM `LoginSecurityEvent` WHERE userId = ?",
    [owner.userId],
  );
  const geminiAnalysisRequests = await connection.query(
    "SELECT userId FROM `GeminiAnalysisRequest` WHERE userId = ?",
    [owner.userId],
  );
  const crossUserAccess = await connection.query(
    "SELECT id FROM `Subscription` WHERE id = ? AND userId = ?",
    [other.subscriptionId, owner.userId],
  );
  const crossUserPaymentAccess = await connection.query(
    "SELECT id FROM `PaymentHistory` WHERE id = ? AND userId = ?",
    [other.paymentHistoryId, owner.userId],
  );

  assert.deepEqual(
    subscriptions.map((row) => row.id),
    [owner.subscriptionId],
  );
  assert.deepEqual(
    usages.map((row) => row.subscriptionId),
    [owner.subscriptionId],
  );
  assert.deepEqual(
    weeklyUsageReviews.map((row) => row.subscriptionId),
    [owner.subscriptionId],
  );
  assert.deepEqual(
    priceHistories.map((row) => row.subscriptionId),
    [owner.subscriptionId],
  );
  assert.deepEqual(
    paymentHistories.map((row) => [row.id, row.subscriptionId]),
    [[owner.paymentHistoryId, owner.subscriptionId]],
  );
  assert.deepEqual(
    preferences.map((row) => row.userId),
    [owner.userId],
  );
  assert.deepEqual(
    challenges.map((row) => row.subscriptionId),
    [owner.subscriptionId],
  );
  assert.deepEqual(
    monthlyCloses.map((row) => row.userId),
    [owner.userId],
  );
  assert.deepEqual(
    trustedLoginDevices.map((row) => row.userId),
    [owner.userId],
  );
  assert.deepEqual(
    loginSecurityEvents.map((row) => row.userId),
    [owner.userId],
  );
  assert.deepEqual(
    geminiAnalysisRequests.map((row) => row.userId),
    [owner.userId],
  );
  assert.equal(
    new Date(subscriptions[0].lastReviewedAt).getTime(),
    new Date("2099-01-01T00:00:00.000Z").getTime(),
  );
  assert.equal(crossUserAccess.length, 0);
  assert.equal(crossUserPaymentAccess.length, 0);
}

async function assertSingleClaim(
  connection,
  insertQuery,
  insertParams,
  claimQuery,
  tokenId,
  expiredInsertParams,
  expiredTokenId,
) {
  await connection.query(insertQuery, insertParams);
  const firstClaim = await connection.query(claimQuery, [
    new Date(),
    tokenId,
    new Date(),
  ]);
  const secondClaim = await connection.query(claimQuery, [
    new Date(),
    tokenId,
    new Date(),
  ]);
  await connection.query(insertQuery, expiredInsertParams);
  const expiredClaim = await connection.query(claimQuery, [
    new Date(),
    expiredTokenId,
    new Date(),
  ]);
  assert.equal(firstClaim.affectedRows, 1);
  assert.equal(secondClaim.affectedRows, 0);
  assert.equal(expiredClaim.affectedRows, 0);
}

async function assertOneTimeTokens(connection, user) {
  const createdAt = new Date();
  const expiresAt = new Date(Date.now() + 60_000);
  const verificationId = randomUUID();
  const expiredVerificationId = randomUUID();
  const passwordResetId = randomUUID();
  const expiredPasswordResetId = randomUUID();
  const emailChangeId = randomUUID();
  const expiredEmailChangeId = randomUUID();
  const expiredAt = new Date(Date.now() - 60_000);

  await assertSingleClaim(
    connection,
    "INSERT INTO `EmailVerificationToken` (id, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
    [
      verificationId,
      user.userId,
      randomBytes(32).toString("hex"),
      expiresAt,
      createdAt,
    ],
    "UPDATE `EmailVerificationToken` SET usedAt = ? WHERE id = ? AND usedAt IS NULL AND expiresAt > ?",
    verificationId,
    [
      expiredVerificationId,
      user.userId,
      randomBytes(32).toString("hex"),
      expiredAt,
      createdAt,
    ],
    expiredVerificationId,
  );
  await assertSingleClaim(
    connection,
    "INSERT INTO `PasswordResetToken` (id, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
    [
      passwordResetId,
      user.userId,
      randomBytes(32).toString("hex"),
      expiresAt,
      createdAt,
    ],
    "UPDATE `PasswordResetToken` SET usedAt = ? WHERE id = ? AND usedAt IS NULL AND expiresAt > ?",
    passwordResetId,
    [
      expiredPasswordResetId,
      user.userId,
      randomBytes(32).toString("hex"),
      expiredAt,
      createdAt,
    ],
    expiredPasswordResetId,
  );
  await assertSingleClaim(
    connection,
    "INSERT INTO `EmailChangeToken` (id, userId, newEmail, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [
      emailChangeId,
      user.userId,
      `changed_${randomUUID()}@invalid.example`,
      randomBytes(32).toString("hex"),
      expiresAt,
      createdAt,
    ],
    "UPDATE `EmailChangeToken` SET usedAt = ? WHERE id = ? AND usedAt IS NULL AND expiresAt > ?",
    emailChangeId,
    [
      expiredEmailChangeId,
      user.userId,
      `expired_${randomUUID()}@invalid.example`,
      randomBytes(32).toString("hex"),
      expiredAt,
      createdAt,
    ],
    expiredEmailChangeId,
  );
}

async function assertTokenClaimRollback(connection, user) {
  const tokenId = randomUUID();
  const now = new Date();
  await connection.query(
    "INSERT INTO `EmailVerificationToken` (id, userId, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)",
    [
      tokenId,
      user.userId,
      randomBytes(32).toString("hex"),
      new Date(Date.now() + 60_000),
      now,
    ],
  );

  await connection.query("SAVEPOINT token_claim_atomicity");
  const firstClaim = await connection.query(
    "UPDATE `EmailVerificationToken` SET usedAt = ? WHERE id = ? AND usedAt IS NULL AND expiresAt > ?",
    [now, tokenId, now],
  );
  assert.equal(firstClaim.affectedRows, 1);
  await connection.query("ROLLBACK TO SAVEPOINT token_claim_atomicity");

  const retryClaim = await connection.query(
    "UPDATE `EmailVerificationToken` SET usedAt = ? WHERE id = ? AND usedAt IS NULL AND expiresAt > ?",
    [now, tokenId, now],
  );
  assert.equal(
    retryClaim.affectedRows,
    1,
    "本処理失敗時にトークン取得がロールバックされていません。",
  );
  await connection.query("RELEASE SAVEPOINT token_claim_atomicity");
}

async function main() {
  const connection = await mariadb.createConnection(databaseConfig());
  try {
    const before = await counts(connection);
    const userA = identity("a");
    const userB = identity("b");
    try {
      await connection.beginTransaction();
      await createUserData(connection, userA, "A");
      await createUserData(connection, userB, "B");
      await assertUserIsolation(connection, userA, userB);
      await assertUserIsolation(connection, userB, userA);
      await assertOneTimeTokens(connection, userA);
      await assertTokenClaimRollback(connection, userA);
    } finally {
      await connection.rollback();
    }

    const after = await counts(connection);
    assert.deepEqual(
      after,
      before,
      "統合テスト後にDBレコード数が変化しています。",
    );
    console.log(
      "DB統合テスト成功: 12種類の所有データを相互に参照できず、認証トークン3種類の一回取得と途中失敗時のロールバックを確認し、DB件数も維持されました。",
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "マルチユーザー分離テストに失敗しました。",
  );
  process.exitCode = 1;
});
