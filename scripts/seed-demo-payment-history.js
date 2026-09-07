/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");

function readEnv() {
  const envPath = path.join(process.cwd(), ".env");
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    env[key] = value;
  }
  return env;
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

function monthsBetween(startKey, endKey) {
  const [startYear, startMonth] = startKey.split("-").map(Number);
  const [endYear, endMonth] = endKey.split("-").map(Number);
  const months = [];
  const cursor = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  while (cursor <= end) {
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function paymentDay(subscription, month) {
  const nextDate = new Date(subscription.nextBillingDate);
  const preferred = Number.isNaN(nextDate.getTime()) ? 10 : nextDate.getDate();
  return Math.min(preferred, new Date(month.year, month.month, 0).getDate());
}

function shouldCreate(subscription, month) {
  if (subscription.billingCycle === "MONTHLY") return true;
  if (subscription.billingCycle === "YEARLY") {
    const renewalMonth = new Date(subscription.nextBillingDate).getMonth() + 1;
    return month.month === renewalMonth;
  }
  if (subscription.billingCycle === "WEEKLY") return true;
  return true;
}

async function main() {
  const env = readEnv();
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const connection = await mariadb.createConnection(databaseConfig(env.DATABASE_URL));
  try {
    const users = await connection.query("SELECT id FROM User WHERE email = ? LIMIT 1", ["user@shinji.work"]);
    if (users.length === 0) throw new Error("Demo user was not found.");
    const userId = users[0].id;
    const subscriptions = await connection.query(
      "SELECT id, name, price, billingCycle, nextBillingDate FROM Subscription WHERE userId = ? AND deletedAt IS NULL",
      [userId],
    );
    const months = monthsBetween("2025-01", "2026-06");
    let inserted = 0;
    let skipped = 0;
    for (const subscription of subscriptions) {
      for (const month of months) {
        if (!shouldCreate(subscription, month)) continue;
        const existing = await connection.query(
          "SELECT id FROM PaymentHistory WHERE userId = ? AND subscriptionId = ? AND YEAR(paidAt) = ? AND MONTH(paidAt) = ? LIMIT 1",
          [userId, subscription.id, month.year, month.month],
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const paidAt = `${month.year}-${String(month.month).padStart(2, "0")}-${String(paymentDay(subscription, month)).padStart(2, "0")} 10:00:00`;
        await connection.query(
          "INSERT INTO PaymentHistory (id, subscriptionId, userId, amount, paidAt, subscriptionNameSnapshot, memo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
          [
            `hist_${subscription.id.slice(-10)}_${month.year}${String(month.month).padStart(2, "0")}`,
            subscription.id,
            userId,
            subscription.price,
            paidAt,
            subscription.name,
            "2025-2026累計表示用データ",
          ],
        );
        inserted++;
      }
    }
    console.log(JSON.stringify({ inserted, skipped, subscriptions: subscriptions.length }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
