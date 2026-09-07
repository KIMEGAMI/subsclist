/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");

const DEFAULT_DEMO_EMAIL = "user@shinji.work";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const JAPAN_TIME_ZONE = "Asia/Tokyo";
const REVIEW_DAYS_AGO = 7;
const USAGE_OFFSETS_BY_FREQUENCY = Object.freeze({
  DAILY: [0, 1, 2, 4, 6, 8, 11, 14, 18, 22, 27, 35, 48, 63, 78],
  WEEKLY: [1, 7, 14, 21, 28, 42, 56, 70],
  MONTHLY: [5, 35, 65],
  RARELY: [45, 80],
  UNKNOWN: [],
});

function readEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const result = {};
  if (!fs.existsSync(envPath)) return result;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^"|"$/g, "");
    result[key] = value;
  }
  return result;
}

function databaseConfig(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: "utf8mb4",
  };
}

function japanDateDaysAgo(daysAgo, now = new Date()) {
  const value = new Date(now.getTime() - daysAgo * MILLISECONDS_PER_DAY);
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: JAPAN_TIME_ZONE,
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function usageId(userId, subscriptionId, usedDate) {
  const digest = crypto
    .createHash("sha256")
    .update(`${userId}\0${subscriptionId}\0${usedDate}`)
    .digest("hex")
    .slice(0, 32);
  return `demo_usage_${digest}`;
}

async function first(connection, sql, params) {
  const rows = await connection.query(sql, params);
  return rows[0] || null;
}

async function main() {
  const env = { ...readEnv(), ...process.env };
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const demoEmail = env.DEMO_USER_EMAIL || DEFAULT_DEMO_EMAIL;
  const connection = await mariadb.createConnection(
    databaseConfig(env.DATABASE_URL),
  );

  try {
    await connection.beginTransaction();
    const user = await first(
      connection,
      "SELECT id FROM User WHERE email = ? LIMIT 1",
      [demoEmail],
    );
    if (!user) throw new Error("Demo user was not found.");

    const subscriptions = await connection.query(
      "SELECT id, usageFrequency FROM Subscription WHERE userId = ? AND status = 'ACTIVE' AND deletedAt IS NULL ORDER BY id",
      [user.id],
    );
    const now = new Date();
    let usageRecords = 0;

    for (const subscription of subscriptions) {
      const offsets =
        USAGE_OFFSETS_BY_FREQUENCY[subscription.usageFrequency] ??
        USAGE_OFFSETS_BY_FREQUENCY.UNKNOWN;
      for (const daysAgo of offsets) {
        const usedDate = japanDateDaysAgo(daysAgo, now);
        await connection.query(
          "INSERT INTO SubscriptionUsage (id, userId, subscriptionId, usedDate, usageCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE usageCount = VALUES(usageCount), updatedAt = NOW()",
          [usageId(user.id, subscription.id, usedDate), user.id, subscription.id, usedDate],
        );
        usageRecords++;
      }

      if (subscription.usageFrequency !== "UNKNOWN") {
        await connection.query(
          "UPDATE Subscription SET lastReviewedAt = COALESCE(lastReviewedAt, ?), updatedAt = NOW() WHERE id = ? AND userId = ?",
          [japanDateDaysAgo(REVIEW_DAYS_AGO, now), subscription.id, user.id],
        );
      }
    }

    await connection.commit();
    console.log(
      JSON.stringify(
        { subscriptions: subscriptions.length, usageRecords },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo usage seed failed.");
  process.exit(1);
});
