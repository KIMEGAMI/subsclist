import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAuthMailRateLimitForTests } from "@/lib/auth-mail-rate-limit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const clearSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const verificationMailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: async () => authState.user,
    clearSession: clearSessionMock,
  };
});
vi.mock("@/lib/mail", () => ({ sendVerificationEmail: verificationMailMock }));

import { GET as getAdminStatus } from "@/app/api/admin/me/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as resendVerification } from "@/app/api/auth/resend-verification/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function resendRequest() {
  return new Request("http://127.0.0.1:3100/api/auth/resend-verification", {
    method: "POST",
    headers: { "user-agent": "SubscList integration test" },
  });
}

afterEach(async () => {
  authState.user = null;
  clearSessionMock.mockClear();
  verificationMailMock.mockReset();
  verificationMailMock.mockResolvedValue(undefined);
  resetAuthMailRateLimitForTests();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("セッションと管理者確認", () => {
  it("ログアウト時にセッションCookie削除処理を呼ぶ", async () => {
    const response = await logout();
    expect(response.status).toBe(200);
    expect(clearSessionMock).toHaveBeenCalledOnce();
  });

  it("認証済み管理者だけを管理者として返す", async () => {
    expect(await (await getAdminStatus()).json()).toEqual({ isAdmin: false });
    authState.user = await user({ email: env.adminUserEmail, verified: false });
    expect(await (await getAdminStatus()).json()).toEqual({ isAdmin: false });
    await prisma.user.update({ where: { id: authState.user.id }, data: { emailVerified: new Date() } });
    authState.user = { ...authState.user, emailVerified: new Date() };
    const response = await getAdminStatus();
    expect(await response.json()).toEqual({ isAdmin: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("認証メール再送", () => {
  it("未ログインを拒否し、認証済みユーザーには送信しない", async () => {
    expect((await resendVerification(resendRequest())).status).toBe(401);
    authState.user = await user({ verified: true });
    expect((await resendVerification(resendRequest())).status).toBe(200);
    expect(verificationMailMock).not.toHaveBeenCalled();
  });

  it("未認証ユーザーへ送信し、旧トークンを無効化する", async () => {
    const owner = await user({ verified: false });
    authState.user = owner;
    await prisma.emailVerificationToken.create({
      data: { userId: owner.id, tokenHash: uniqueLabel("old-verification"), expiresAt: new Date("2099-01-01T00:00:00.000Z") },
    });
    const response = await resendVerification(resendRequest());
    expect(response.status).toBe(200);
    expect(verificationMailMock).toHaveBeenCalledWith(owner.email, expect.any(String));
    expect(await prisma.emailVerificationToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(1);
  });

  it("連続再送を制限する", async () => {
    authState.user = await user({ verified: false });
    expect((await resendVerification(resendRequest())).status).toBe(200);
    const limited = await resendVerification(resendRequest());
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(verificationMailMock).toHaveBeenCalledOnce();
  });

  it("メール送信失敗時に送信回数を戻し、生成トークンを無効化する", async () => {
    const owner = await user({ verified: false });
    authState.user = owner;
    verificationMailMock.mockRejectedValueOnce(new Error("SMTP internal detail"));
    const failed = await resendVerification(resendRequest());
    expect(failed.status).toBe(500);
    expect(await prisma.emailVerificationToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(0);
    expect(JSON.stringify(await failed.json())).not.toContain("SMTP internal detail");

    expect((await resendVerification(resendRequest())).status).toBe(200);
    expect(verificationMailMock).toHaveBeenCalledTimes(2);
  });
});
