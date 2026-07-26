/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const mariadb = require("mariadb");
const fs = require("node:fs");
const path = require("node:path");

function readEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return {};

  return fs.readFileSync(envPath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return env;
    const index = trimmed.indexOf("=");
    if (index === -1) return env;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
    return { ...env, [key]: value };
  }, {});
}

function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
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

async function main() {
  const env = { ...readEnv(), ...process.env };
  const email = required(env, "ADMIN_USER_EMAIL").trim().toLowerCase();
  const password = required(env, "ADMIN_USER_PASSWORD");
  const connection = await mariadb.createConnection(
    databaseConfig(required(env, "DATABASE_URL")),
  );

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await connection.query(
      "SELECT id FROM User WHERE email = ? LIMIT 1",
      [email],
    );
    const existing = rows[0];

    if (existing) {
      await connection.query(
        "UPDATE User SET name = ?, emailVerified = NOW(), passwordHash = ?, plan = 'PREMIUM', updatedAt = NOW() WHERE id = ?",
        ["管理者", passwordHash, existing.id],
      );
    } else {
      await connection.query(
        "INSERT INTO User (id, name, email, emailVerified, passwordHash, plan, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), ?, 'PREMIUM', NOW(), NOW())",
        ["admin_user_shinji_work", "管理者", email, passwordHash],
      );
    }

    console.log("管理者アカウントを登録しました。");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "管理者アカウントの登録に失敗しました。");
  process.exit(1);
});
