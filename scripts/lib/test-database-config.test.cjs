/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { testDatabaseConfig } = require("./test-database-config.cjs");
const { requiredPrismaNodeRange, satisfiesNodeRange } = require("./node-engine.cjs");

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousTestDatabaseUrl = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = previousTestDatabaseUrl;
});

test("本番名のDBはローカルホストでも拒否する", () => {
  process.env.TEST_DATABASE_URL = "";
  process.env.DATABASE_URL = "mysql://localhost:3306/subsclist";
  assert.throws(testDatabaseConfig, /テスト専用MySQL/);
});

test("テスト名でも外部ホストは拒否する", () => {
  process.env.TEST_DATABASE_URL = "";
  process.env.DATABASE_URL = "mysql://db.example.com:3306/subsclist_test";
  assert.throws(testDatabaseConfig, /テスト専用MySQL/);
});

test("許可されたローカルテストDBだけ接続設定を返す", () => {
  process.env.DATABASE_URL =
    "mysql://127.0.0.1:3306/subsclist_ci?allowPublicKeyRetrieval=true";
  assert.deepEqual(testDatabaseConfig(), {
    host: "127.0.0.1",
    port: 3306,
    user: "",
    password: "",
    database: "subsclist_ci",
    charset: "utf8mb4",
    allowPublicKeyRetrieval: true,
  });
});

test("production Node.js gate matches the Prisma versions in the lockfile", () => {
  const lockfile = require("../../package-lock.json");
  const range = requiredPrismaNodeRange(lockfile);
  assert.equal(satisfiesNodeRange("20.9.0", range), false);
  assert.equal(satisfiesNodeRange("20.19.0", range), true);
  assert.equal(satisfiesNodeRange("22.12.0", range), true);
  assert.equal(satisfiesNodeRange("24.0.0", range), true);
});
