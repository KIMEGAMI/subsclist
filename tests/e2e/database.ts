import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { maintenanceModeKey } from "../../src/lib/admin-constants";

function testPrisma() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = url.pathname.replace(/^\//, "");
  if (!/_(?:test|ci)$/.test(database)) {
    throw new Error("E2Eはテスト専用DBでのみ実行できます。");
  }
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
  });
  return new PrismaClient({ adapter });
}

export async function seedE2eUsers() {
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
  const demoEmail = process.env.E2E_DEMO_EMAIL ?? "";
  const password = process.env.E2E_USER_PASSWORD ?? "";
  if (!adminEmail || !demoEmail || password.length < 16) {
    throw new Error("E2E fixture用の環境変数が不足しています。");
  }
  const prisma = testPrisma();
  try {
    await prisma.appSetting.upsert({
      where: { key: maintenanceModeKey },
      create: { key: maintenanceModeKey, value: "disabled" },
      update: { value: "disabled" },
    });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, demoEmail] } } });
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.create({
      data: {
        name: "E2E管理者",
        email: adminEmail,
        passwordHash,
        emailVerified: new Date(),
        plan: "PREMIUM",
      },
    });
    await prisma.user.create({
      data: {
        name: "E2Eデモ",
        email: demoEmail,
        passwordHash,
        emailVerified: new Date(),
        plan: "PREMIUM",
        subscriptions: {
          create: {
            name: "E2E Cloud",
            price: 480,
            billingCycle: "MONTHLY",
            nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
            status: "ACTIVE",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function cleanupE2eUsers() {
  const emails = [process.env.E2E_ADMIN_EMAIL, process.env.E2E_DEMO_EMAIL].filter(
    (value): value is string => Boolean(value),
  );
  if (emails.length === 0) return;
  const prisma = testPrisma();
  try {
    await prisma.appSetting.upsert({
      where: { key: maintenanceModeKey },
      create: { key: maintenanceModeKey, value: "disabled" },
      update: { value: "disabled" },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } finally {
    await prisma.$disconnect();
  }
}
