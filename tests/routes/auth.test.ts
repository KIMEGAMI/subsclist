import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetAuthMailRateLimitForTests } from "@/lib/auth-mail-rate-limit";
import { LOGIN_ACCOUNT_LOCK_THRESHOLD } from "@/lib/app-constants";
import { uniqueLabel } from "../helpers/database";

const cookieMocks = vi.hoisted(() => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
  delete: vi.fn(),
}));
const mailMocks = vi.hoisted(() => ({
  verification: vi.fn(async () => undefined),
  locked: vi.fn(async () => undefined),
  newDevice: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookieMocks,
}));
vi.mock("@/lib/mail", () => ({
  sendVerificationEmail: mailMocks.verification,
  sendAccountLockedEmail: mailMocks.locked,
  sendNewDeviceLoginEmail: mailMocks.newDevice,
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";

async function body<T>(response: Response) {
  return (await response.json()) as T;
}

afterEach(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "integration_auth_" } },
  });
  vi.clearAllMocks();
  resetAuthMailRateLimitForTests();
});

describe("認証RouteとMySQL", () => {
  it("登録時に小文字email・bcrypt hash・初期データだけを保存する", async () => {
    const local = uniqueLabel("integration_auth_register");
    const email = `${local}@invalid.example`;
    const password = `${uniqueLabel("Register")}A1!`;
    const response = await register(
      new Request("http://localhost:3100/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "登録テスト",
          email: email.toUpperCase(),
          password,
          termsAccepted: true,
          privacyAccepted: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    const data = await body<Record<string, unknown>>(response);
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("token");
    expect(mailMocks.verification).toHaveBeenCalledTimes(1);

    const saved = await prisma.user.findUnique({
      where: { email },
      include: { categories: true, emailVerificationTokens: true },
    });
    expect(saved).not.toBeNull();
    expect(saved?.emailVerified).toBeNull();
    expect(saved?.categories).toHaveLength(5);
    expect(saved?.emailVerificationTokens).toHaveLength(1);
    expect(await bcrypt.compare(password, saved?.passwordHash ?? "")).toBe(true);
    expect(saved?.passwordHash).not.toBe(password);
  });

  it("不正emailではDBへ登録しない", async () => {
    const before = await prisma.user.count();
    const response = await register(
      new Request("http://localhost:3100/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "不正入力",
          email: "invalid",
          password: `${uniqueLabel("InvalidEmail")}A1!`,
          termsAccepted: true,
          privacyAccepted: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await prisma.user.count()).toBe(before);
  });

  it("未認証の登録済みユーザーには認証メールだけを再送し、認証情報を上書きしない", async () => {
    const email = `${uniqueLabel("integration_auth_existing_unverified")}@invalid.example`;
    const originalPassword = `${uniqueLabel("Original")}A1!`;
    const submittedPassword = `${uniqueLabel("Submitted")}A1!`;
    const existing = await prisma.user.create({
      data: {
        name: "元のユーザー名",
        email,
        passwordHash: await bcrypt.hash(originalPassword, 4),
        emailVerified: null,
        emailVerificationTokens: {
          create: {
            tokenHash: uniqueLabel("old-verification-token"),
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          },
        },
      },
    });

    const response = await register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "上書きを試みる名前",
        email: email.toUpperCase(),
        password: submittedPassword,
        termsAccepted: true,
        privacyAccepted: true,
      }),
    }));

    expect(response.status).toBe(200);
    expect(await body<Record<string, unknown>>(response)).toMatchObject({ alreadyRegistered: true });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(saved.name).toBe("元のユーザー名");
    expect(await bcrypt.compare(originalPassword, saved.passwordHash)).toBe(true);
    expect(await bcrypt.compare(submittedPassword, saved.passwordHash)).toBe(false);
    expect(await prisma.emailVerificationToken.count({ where: { userId: existing.id, usedAt: null } })).toBe(1);
  });

  it("未認証ユーザーへの再送失敗時は送信できなかったトークンを失効する", async () => {
    const email = `${uniqueLabel("integration_auth_resend_failure")}@invalid.example`;
    const password = `${uniqueLabel("Existing")}A1!`;
    const existing = await prisma.user.create({
      data: {
        name: "未認証ユーザー",
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: null,
      },
    });
    mailMocks.verification.mockRejectedValueOnce(new Error("SMTP internal detail"));

    const response = await register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "未認証ユーザー",
        email,
        password,
        termsAccepted: true,
        privacyAccepted: true,
      }),
    }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SMTP internal detail");
    expect(await prisma.emailVerificationToken.count({ where: { userId: existing.id, usedAt: null } })).toBe(0);
  });

  it("正しいpasswordでログインし失敗回数を解除する", async () => {
    const email = `${uniqueLabel("integration_auth_login")}@invalid.example`;
    const password = `${uniqueLabel("Login")}A1!`;
    const user = await prisma.user.create({
      data: {
        name: "ログインテスト",
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: new Date(),
        failedLoginCount: 2,
        lastFailedLoginAt: new Date(),
      },
    });
    const response = await login(
      new Request("http://localhost:3100/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "SubscList Integration Test",
        },
        body: JSON.stringify({ email: email.toUpperCase(), password }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await body<{ redirectTo: string }>(response)).toMatchObject({ redirectTo: "/dashboard" });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.failedLoginCount).toBe(0);
    expect(saved.lastFailedLoginAt).toBeNull();
    expect(cookieMocks.set).toHaveBeenCalled();
  });

  it("存在しないユーザーとpassword間違いで同じメッセージを返す", async () => {
    const email = `${uniqueLabel("integration_auth_wrong")}@invalid.example`;
    const correctPassword = `${uniqueLabel("Correct")}A1!`;
    const wrongPassword = `${uniqueLabel("Wrong")}A1!`;
    await prisma.user.create({
      data: {
        name: "認証失敗テスト",
        email,
        passwordHash: await bcrypt.hash(correctPassword, 4),
        emailVerified: new Date(),
      },
    });
    const request = (targetEmail: string) =>
      new Request("http://localhost:3100/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: wrongPassword }),
      });
    const wrong = await login(request(email));
    const missing = await login(request(`${uniqueLabel("integration_auth_missing")}@invalid.example`));
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await body(wrong)).toEqual(await body(missing));
  });

  it("不正JSONを400で拒否する", async () => {
    const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect(response.status).toBe(400);
  });

  it("メール未認証ユーザーは認証画面へ遷移させる", async () => {
    const email = `${uniqueLabel("integration_auth_unverified")}@invalid.example`;
    const password = `${uniqueLabel("Unverified")}A1!`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: null,
      },
    });
    const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }));
    expect(response.status).toBe(200);
    expect(await body<{ redirectTo: string }>(response)).toMatchObject({ redirectTo: "/verify-email" });
  });

  it("ロック期限内のユーザーを429で拒否する", async () => {
    const email = `${uniqueLabel("integration_auth_locked")}@invalid.example`;
    const password = `${uniqueLabel("Locked")}A1!`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: new Date(),
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }));
    expect(response.status).toBe(429);
  });

  it("連続失敗でアカウントをロックし、通知は一度だけ送る", async () => {
    const email = `${uniqueLabel("integration_auth_lock_threshold")}@invalid.example`;
    const correctPassword = `${uniqueLabel("Correct")}A1!`;
    const wrongPassword = `${uniqueLabel("Wrong")}A1!`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(correctPassword, 4),
        emailVerified: new Date(),
      },
    });
    const request = () => new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: wrongPassword }),
    });

    for (let index = 0; index < LOGIN_ACCOUNT_LOCK_THRESHOLD; index += 1) {
      expect((await login(request())).status).toBe(401);
    }
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.lockedUntil).toBeInstanceOf(Date);
    expect(mailMocks.locked).toHaveBeenCalledOnce();
    expect(await prisma.loginSecurityEvent.count({ where: { userId: user.id, type: "ACCOUNT_LOCKED" } })).toBe(1);

    expect((await login(request())).status).toBe(429);
    expect(mailMocks.locked).toHaveBeenCalledOnce();
  });

  it("ロック通知の送信失敗でもアカウント保護を維持する", async () => {
    const email = `${uniqueLabel("integration_auth_lock_mail_failure")}@invalid.example`;
    const correctPassword = `${uniqueLabel("Correct")}A1!`;
    const wrongPassword = `${uniqueLabel("Wrong")}A1!`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(correctPassword, 4),
        emailVerified: new Date(),
        failedLoginCount: LOGIN_ACCOUNT_LOCK_THRESHOLD - 1,
        lastFailedLoginAt: new Date(),
      },
    });
    mailMocks.locked.mockRejectedValueOnce(new Error("mail provider unavailable"));

    const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: wrongPassword }),
    }));
    expect(response.status).toBe(401);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lockedUntil).toBeInstanceOf(Date);
    expect(mailMocks.locked).toHaveBeenCalledOnce();
  });
});
