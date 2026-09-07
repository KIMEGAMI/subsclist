import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = url.pathname.replace(/^\//, "");
  if (!/_(?:test|ci)$/.test(database)) {
    throw new Error("テスト専用DB以外への接続を拒否しました。");
  }
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await prisma.$disconnect();
});
