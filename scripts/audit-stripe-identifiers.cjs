/* eslint-disable @typescript-eslint/no-require-imports */
const mariadb = require("mariadb");
const { testDatabaseConfig } = require("./lib/test-database-config.cjs");

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
  const connection = await mariadb.createConnection(testDatabaseConfig());
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
