/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const allowedDatabasePattern = /_(?:test|ci)$/;
const allowedHosts = new Set(["localhost", "127.0.0.1", "mysql"]);

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .find((candidate) => new RegExp(`^\\s*${name}\\s*=`).test(candidate));
  if (!line) return "";
  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
}

function testDatabaseUrl() {
  const configured = envValue("TEST_DATABASE_URL");
  if (configured) return configured;

  const developmentUrl = envValue("DATABASE_URL");
  if (!developmentUrl) return "";
  const parsed = new URL(developmentUrl);
  const database = parsed.pathname.replace(/^\//, "");
  if (!allowedHosts.has(parsed.hostname) || database !== "subsclist") return "";
  parsed.pathname = "/subsclist_test";
  return parsed.toString();
}

const databaseUrl = testDatabaseUrl();
if (!databaseUrl) {
  console.error("TEST_DATABASE_URLが設定されていません。");
  process.exit(1);
}

const parsedUrl = new URL(databaseUrl);
const databaseName = parsedUrl.pathname.replace(/^\//, "");
if (!allowedHosts.has(parsedUrl.hostname) || !allowedDatabasePattern.test(databaseName)) {
  console.error("テスト専用MySQL以外への接続を拒否しました。");
  process.exit(1);
}

const mode = process.argv[2] ?? "routes";
const requestedTestFile = process.env.DB_TEST_FILE ?? "";
if (requestedTestFile) {
  const normalizedTestFile = path.posix.normalize(requestedTestFile.replace(/\\/g, "/"));
  if (
    !normalizedTestFile.startsWith("tests/routes/")
    || normalizedTestFile.includes("..")
    || !normalizedTestFile.endsWith(".test.ts")
  ) {
    console.error("DB_TEST_FILEはtests/routes配下のテストファイルだけを指定できます。");
    process.exit(1);
  }
  process.env.DB_TEST_FILE = normalizedTestFile;
}
const generatedTestSecret = randomTestValue();
const environment = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  APP_URL: "http://127.0.0.1:3100",
  NEXTAUTH_URL: "http://127.0.0.1:3100",
  AUTH_SECRET: generatedTestSecret,
  NEXTAUTH_SECRET: generatedTestSecret,
  NOTIFICATION_JOB_SECRET: randomTestValue(),
  ADMIN_USER_EMAIL: "admin.integration@invalid.example",
  DEMO_USER_EMAIL: "demo.integration@invalid.example",
  STRIPE_SECRET_KEY: `sk_test_${randomTestValue()}`,
  STRIPE_WEBHOOK_SECRET: `whsec_${randomTestValue()}`,
  STRIPE_PREMIUM_PRICE_ID: "price_integration_placeholder",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1",
  SMTP_SECURE: "false",
  SMTP_USER: "integration@invalid.example",
  SMTP_PASS: randomTestValue(),
  MAIL_FROM: "SubscList Integration <integration@invalid.example>",
  RESEND_API_KEY: "",
  GOOGLE_CLIENT_ID: randomTestValue(),
  GOOGLE_CLIENT_SECRET: randomTestValue(),
  GEMINI_API_KEY: randomTestValue(),
  E2E_ADMIN_EMAIL: "admin.integration@invalid.example",
  E2E_DEMO_EMAIL: "demo.integration@invalid.example",
  E2E_MEMBER_EMAIL: "member.integration@invalid.example",
  E2E_USER_PASSWORD: randomTestValue(),
};

let command;
let args;
if (mode === "isolation") {
  command = process.execPath;
  args = [path.join(process.cwd(), "scripts", "test-multi-user-isolation.cjs")];
} else if (mode === "stripe-audit") {
  command = process.execPath;
  args = [path.join(process.cwd(), "scripts", "audit-stripe-identifiers.cjs")];
} else if (mode === "savings-migration-backfill") {
  command = process.execPath;
  args = [path.join(process.cwd(), "scripts", "test-savings-migration-backfill.cjs")];
} else if (mode === "e2e") {
  environment.GOOGLE_CLIENT_ID = "";
  environment.GOOGLE_CLIENT_SECRET = "";
  const e2eDistDir = process.env.E2E_NEXT_DIST_DIR ?? ".next-e2e";
  if (!/^\.next-[A-Za-z0-9._-]+$/.test(e2eDistDir)) {
    console.error("E2E_NEXT_DIST_DIRは.next-で始まるローカル出力先だけ指定できます。");
    process.exit(1);
  }
  environment.NEXT_DIST_DIR = e2eDistDir;
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error("npm CLIの実行パスを確認できませんでした。");
    process.exit(1);
  }
  const build = spawnSync(process.execPath, [npmCli, "run", "build"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (build.error) console.error(build.error.message);
  if (build.status !== 0) process.exit(build.status ?? 1);
  command = process.execPath;
  args = [
    path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"),
    "test",
    "--config",
    "playwright.config.ts",
  ];
} else {
  command = process.execPath;
  args = [
    path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs"),
    "run",
    "--config",
    "vitest.config.mts",
  ];
  if (requestedTestFile) args.push(process.env.DB_TEST_FILE);
  if (mode === "coverage") args.push("--coverage");
  // Allow the caller to control Vitest execution without bypassing the DB safety checks above.
  args.push(...process.argv.slice(3));
}

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);

function randomTestValue() {
  return require("node:crypto").randomBytes(24).toString("base64url");
}
