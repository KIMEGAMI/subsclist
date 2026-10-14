/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const allowedHosts = new Set(["localhost", "127.0.0.1", "mysql"]);
const allowedDatabasePattern = /_(?:test|ci)$/;

function readDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const envLines = fs
    .readFileSync(envPath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const line =
    envLines.find((candidate) => /^\s*TEST_DATABASE_URL\s*=/.test(candidate)) ??
    envLines.find((candidate) => /^\s*DATABASE_URL\s*=/.test(candidate));
  if (!line) return "";

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
}

function testDatabaseConfig() {
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URLが設定されていません。");

  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");
  if (
    url.protocol !== "mysql:" ||
    !allowedHosts.has(url.hostname) ||
    !allowedDatabasePattern.test(database)
  ) {
    throw new Error("ローカルのテスト専用MySQL以外への接続を拒否しました。");
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

module.exports = { testDatabaseConfig };
