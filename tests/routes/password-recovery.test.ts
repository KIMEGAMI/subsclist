import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth";
import { resetAuthMailRateLimitForTests } from "@/lib/auth-mail-rate-limit";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, uniqueLabel } from "../helpers/database";

const cookieMocks = vi.hoisted(() => ({ delete: vi.fn() }));
const mailMocks = vi.hoisted(() => ({ reset: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({ cookies: async () => cookieMocks }));
vi.mock("@/lib/mail", () => ({ sendPasswordResetEmail: mailMocks.reset }));

import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";

const createdUserIds: string[] = [];

function jsonRequest(path: string, payload: object) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  resetAuthMailRateLimitForTests();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("パスワード再設定", () => {
  it("存在するメールに一回用トークンを作成して送信する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const response = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: owner.email.toUpperCase() }));

    expect(response.status).toBe(200);
    expect(mailMocks.reset).toHaveBeenCalledTimes(1);
    expect(await prisma.passwordResetToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(1);
  });

  it("存在しないメールでも同じ成功応答を返して登録有無を漏らさない", async () => {
    const response = await forgotPassword(jsonRequest("/api/auth/forgot-password", {
      email: `${uniqueLabel("missing_recovery")}@invalid.example`,
    }));
    expect(response.status).toBe(200);
    expect(mailMocks.reset).not.toHaveBeenCalled();
  });

  it("メール送信失敗時は生成トークンを失効し、直ちに再試行できる", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    mailMocks.reset.mockRejectedValueOnce(new Error("SMTP internal detail"));

    const failed = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: owner.email }));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("SMTP internal detail");
    expect(await prisma.passwordResetToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(0);

    const retried = await forgotPassword(jsonRequest("/api/auth/forgot-password", { email: owner.email }));
    expect(retried.status).toBe(200);
    expect(mailMocks.reset).toHaveBeenCalledTimes(2);
    expect(await prisma.passwordResetToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(1);
  });

  it("有効なトークンでパスワードとsessionVersionを更新する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("RecoveryToken");
    const record = await prisma.passwordResetToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    const newPassword = `${uniqueLabel("NewRecovery")}A1!`;

    const response = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token,
      newPassword,
      newPasswordConfirm: newPassword,
    }));

    expect(response.status).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(await bcrypt.compare(newPassword, saved.passwordHash)).toBe(true);
    expect(saved.sessionVersion).toBe(owner.sessionVersion + 1);
    expect((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: record.id } })).usedAt).toBeInstanceOf(Date);
    expect(cookieMocks.delete).toHaveBeenCalled();
  });

  it("現在と同じパスワードへの再設定を拒否しトークンを保持する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("SamePasswordRecoveryToken");
    const record = await prisma.passwordResetToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });

    const response = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token,
      newPassword: owner.password,
      newPasswordConfirm: owner.password,
    }));

    expect(response.status).toBe(400);
    expect((await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: record.id } })).usedAt).toBeNull();
  });

  it("使用済みトークンを再利用できない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("UsedRecoveryToken");
    await prisma.passwordResetToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() },
    });
    const newPassword = `${uniqueLabel("BlockedRecovery")}A1!`;
    const response = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token,
      newPassword,
      newPasswordConfirm: newPassword,
    }));
    expect(response.status).toBe(400);
    expect(await bcrypt.compare(owner.password, (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash)).toBe(true);
  });

  it("期限切れと改ざんトークンを拒否する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("ExpiredRecoveryToken");
    await prisma.passwordResetToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1_000) },
    });
    const newPassword = `${uniqueLabel("ExpiredRecovery")}A1!`;
    const expired = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token,
      newPassword,
      newPasswordConfirm: newPassword,
    }));
    const tampered = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token: `${token}tampered`,
      newPassword,
      newPasswordConfirm: newPassword,
    }));
    expect(expired.status).toBe(400);
    expect(tampered.status).toBe(400);
  });
});
