/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const mariadb = require("mariadb");

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

function duplicateResult(rows) {
  return {
    duplicateGroups: Number(rows[0].duplicateGroups),
    affectedRows: Number(rows[0].affectedRows),
  };
}

async function customerIdDuplicateSummary(connection) {
  const rows = await connection.query(
    `SELECT COUNT(*) AS duplicateGroups, COALESCE(SUM(groupSize), 0) AS affectedRows
     FROM (
       SELECT COUNT(*) AS groupSize
       FROM \`User\`
       WHERE stripeCustomerId IS NOT NULL AND stripeCustomerId <> ''
       GROUP BY stripeCustomerId
       HAVING COUNT(*) > 1
     ) AS duplicates`,
  );
  return duplicateResult(rows);
}

async function subscriptionIdDuplicateSummary(connection) {
  const rows = await connection.query(
    `SELECT COUNT(*) AS duplicateGroups, COALESCE(SUM(groupSize), 0) AS affectedRows
     FROM (
       SELECT COUNT(*) AS groupSize
       FROM \`User\`
       WHERE stripeSubscriptionId IS NOT NULL AND stripeSubscriptionId <> ''
       GROUP BY stripeSubscriptionId
       HAVING COUNT(*) > 1
     ) AS duplicates`,
  );
  return duplicateResult(rows);
}

async function identifierStateSummary(connection) {
  const rows = await connection.query(
    `SELECT
       COUNT(*) AS totalUsers,
       SUM(stripeCustomerId IS NOT NULL AND stripeCustomerId <> '') AS customerIds,
       SUM(stripeSubscriptionId IS NOT NULL AND stripeSubscriptionId <> '') AS subscriptionIds,
       SUM(stripeCustomerId = '') AS emptyCustomerIds,
       SUM(stripeSubscriptionId = '') AS emptySubscriptionIds,
       SUM(
         stripeCustomerId IS NULL AND
         stripeSubscriptionId IS NOT NULL AND stripeSubscriptionId <> ''
       ) AS subscriptionOnly,
       SUM(plan = 'LIFETIME') AS legacyLifetimeUsers
     FROM \`User\``,
  );
  return Object.fromEntries(
    Object.entries(rows[0])
      .filter(([key]) => key !== "meta")
      .map(([key, value]) => [key, Number(value)]),
  );
}

async function main() {
  const connection = await mariadb.createConnection(databaseConfig());
  try {
    const [customerIds, subscriptionIds, states] = await Promise.all([
      customerIdDuplicateSummary(connection),
      subscriptionIdDuplicateSummary(connection),
      identifierStateSummary(connection),
    ]);
    console.log(
      JSON.stringify(
        {
          stripeCustomerId: customerIds,
          stripeSubscriptionId: subscriptionIds,
          states,
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  console.error("Stripe識別子の監査に失敗しました。DB設定と接続状態を確認してください。");
  process.exitCode = 1;
});
