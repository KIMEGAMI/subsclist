import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type TestUser = Awaited<ReturnType<typeof createTestUser>>;

export async function createTestUser(options?: {
  email?: string;
  password?: string;
  plan?: "FREE" | "PREMIUM";
  verified?: boolean;
  name?: string;
}) {
  const suffix = randomUUID().replaceAll("-", "");
  const password = options?.password ?? `${randomBytes(18).toString("base64url")}A1!`;
  const user = await prisma.user.create({
    data: {
      name: options?.name ?? "統合テストユーザー",
      email: options?.email ?? `integration_${suffix}@invalid.example`,
      passwordHash: await bcrypt.hash(password, 4),
      emailVerified: options?.verified === false ? null : new Date(),
      plan: options?.plan ?? "PREMIUM",
    },
  });
  return { ...user, password };
}

export async function deleteTestUsers(...userIds: string[]) {
  if (userIds.length === 0) return;
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export function uniqueLabel(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
