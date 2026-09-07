import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const sessionState = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : {
          ok: false as const,
          response: Response.json({ message: "ログインしてください。" }, { status: 401 }),
        },
}));
vi.mock("@/lib/auth", () => ({
  setSession: async (userId: string) => {
    sessionState.userId = userId;
  },
}));

import { PUT } from "@/app/api/settings/password/route";

const createdUserIds: string[] = [];

function request(payload: object) {
  return new Request("http://127.0.0.1:3100/api/settings/password", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  sessionState.userId = "";
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("パスワード変更", () => {
  it("確認用パスワード不一致では更新しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    const response = await PUT(request({
      currentPassword: owner.password,
      newPassword: `${uniqueLabel("New")}A1!`,
      newPasswordConfirm: `${uniqueLabel("Different")}A1!`,
    }));

    expect(response.status).toBe(400);
    expect(await bcrypt.compare(owner.password, (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash)).toBe(true);
  });

  it("現在のパスワードが違う場合は更新しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    const newPassword = `${uniqueLabel("New")}A1!`;
    const response = await PUT(request({
      currentPassword: `${uniqueLabel("Wrong")}A1!`,
      newPassword,
      newPasswordConfirm: newPassword,
    }));

    expect(response.status).toBe(400);
    expect(await bcrypt.compare(newPassword, (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash)).toBe(false);
  });

  it("正常変更時にハッシュ・sessionVersionを更新し未使用トークンを失効する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    const newPassword = `${uniqueLabel("New")}A1!`;
    const token = await prisma.passwordResetToken.create({
      data: {
        userId: owner.id,
        tokenHash: uniqueLabel("TokenHash"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await PUT(request({
      currentPassword: owner.password,
      newPassword,
      newPasswordConfirm: newPassword,
    }));

    expect(response.status).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await bcrypt.compare(newPassword, saved.passwordHash)).toBe(true);
    expect(saved.sessionVersion).toBe(owner.sessionVersion + 1);
    expect((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: token.id } })).usedAt).toBeInstanceOf(Date);
    expect(sessionState.userId).toBe(owner.id);
  });
});
