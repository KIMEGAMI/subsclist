import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetAuthMailRateLimitForTests } from "@/lib/auth-mail-rate-limit";
import { AUTH_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_ACCOUNT_LOCK_THRESHOLD } from "@/lib/app-constants";
import { authAttemptKey, isAuthRateLimited } from "@/lib/auth-rate-limit";
import { env } from "@/lib/env";
import { uniqueLabel } from "../helpers/database";

const cookieMocks = vi.hoisted(() => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
  delete: vi.fn(),
}));
const mailMocks = vi.hoisted(() => ({
  verification: vi.fn(async (email: string, token: string) => {
    if (!email || !token) throw new Error("認証メールの宛先またはトークンがありません。");
  }),
  locked: vi.fn(async () => undefined),
  newDevice: vi.fn(async () => undefined),
}));
const nextServerMocks = vi.hoisted(() => {
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  return {
    afterCallbacks,
    after: vi.fn((callback: () => void | Promise<void>) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieMocks,
}));
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, after: nextServerMocks.after };
});
vi.mock("@/lib/mail", () => ({
  sendVerificationEmail: mailMocks.verification,
  sendAccountLockedEmail: mailMocks.locked,
  sendNewDeviceLoginEmail: mailMocks.newDevice,
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";

async function body<T>(response: Response) {
  return (await response.json()) as T;
}

afterEach(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "integration_auth_" } },
  });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  nextServerMocks.afterCallbacks.length = 0;
  resetAuthMailRateLimitForTests();
});

describe("認証RouteとMySQL", () => {
  it("メール所有者が設定したパスワードだけを認証後に使える", async () => {
    const email = `${uniqueLabel("integration_auth_preclaim")}@invalid.example`;
    const attackerPassword = `${uniqueLabel("AttackerChosenPassword")}A1!`;
    const ownerPassword = `${uniqueLabel("MailboxOwnerPassword")}A1!`;
    const registration = await register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "未認証アカウント",
        email,
        password: attackerPassword,
        termsAccepted: true,
        privacyAccepted: true,
      }),
    }));
    expect(registration.status).toBe(202);
    const token = mailMocks.verification.mock.lastCall?.[1];
    if (!token) throw new Error("メール認証トークンが生成されませんでした。");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await bcrypt.compare(attackerPassword, user.passwordHash)).toBe(false);

    const verification = await verifyEmail(new Request("http://localhost:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: ownerPassword, newPasswordConfirm: ownerPassword }),
    }));
    expect(verification.status).toBe(200);

    const attackerLogin = await login(new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: attackerPassword }),
    }));
    expect(attackerLogin.status).toBe(401);

    const ownerLogin = await login(new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: ownerPassword }),
    }));
    expect(ownerLogin.status).toBe(200);
    expect(await body<Record<string, unknown>>(ownerLogin)).toMatchObject({ redirectTo: "/dashboard" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBeInstanceOf(Date);
  });

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

    expect(response.status).toBe(202);
    const data = await body<Record<string, unknown>>(response);
    expect(data).not.toHaveProperty("password");
    expect(data).not.toHaveProperty("token");
    expect(data).not.toHaveProperty("alreadyRegistered");
    expect(data).not.toHaveProperty("mailSent");
    expect(cookieMocks.delete).toHaveBeenCalled();
    expect(mailMocks.verification).toHaveBeenCalledTimes(1);

    const saved = await prisma.user.findUnique({
      where: { email },
      include: { categories: true, emailVerificationTokens: true },
    });
    expect(saved).not.toBeNull();
    expect(saved?.emailVerified).toBeNull();
    expect(saved?.categories).toHaveLength(5);
    expect(saved?.emailVerificationTokens).toHaveLength(1);
    expect(await bcrypt.compare(password, saved?.passwordHash ?? "")).toBe(false);
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

    expect(response.status).toBe(202);
    const responseBody = await body<Record<string, unknown>>(response);
    expect(responseBody).toMatchObject({ ok: true });
    expect(responseBody).not.toHaveProperty("alreadyRegistered");
    expect(responseBody).not.toHaveProperty("mailSent");
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(saved.name).toBe("元のユーザー名");
    expect(await bcrypt.compare(originalPassword, saved.passwordHash)).toBe(true);
    expect(await bcrypt.compare(submittedPassword, saved.passwordHash)).toBe(false);
    expect(await prisma.emailVerificationToken.count({ where: { userId: existing.id, usedAt: null } })).toBe(1);
  });

  it("メール送信失敗を登録済み状態と区別せず、送信できなかったトークンを失効する", async () => {
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

    expect(response.status).toBe(202);
    expect(JSON.stringify(await response.json())).not.toContain("SMTP internal detail");
    expect(await prisma.emailVerificationToken.count({ where: { userId: existing.id, usedAt: null } })).toBe(0);
  });

  it("認証済みアドレスも新規登録と同じ応答を返し、送信制限を適用する", async () => {
    const newEmail = `${uniqueLabel("integration_auth_response_new")}@invalid.example`;
    const password = `${uniqueLabel("ResponseCheck")}A1!`;
    const newResponse = await register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "新規ユーザー", email: newEmail, password, termsAccepted: true, privacyAccepted: true }),
    }));
    const newBody = await body<Record<string, unknown>>(newResponse);
    expect(cookieMocks.delete).toHaveBeenCalledTimes(1);

    resetAuthMailRateLimitForTests();
    const protectedResponse = await register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "予約アカウント", email: env.adminUserEmail, password, termsAccepted: true, privacyAccepted: true }),
    }));
    expect(protectedResponse.status).toBe(newResponse.status);
    expect(await body<Record<string, unknown>>(protectedResponse)).toEqual(newBody);
    expect(cookieMocks.delete).toHaveBeenCalledTimes(2);

    resetAuthMailRateLimitForTests();
    const email = `${uniqueLabel("integration_auth_response_existing")}@invalid.example`;
    await prisma.user.create({ data: { name: "認証済みユーザー", email, passwordHash: await bcrypt.hash(password, 4), emailVerified: new Date() } });
    const request = () => register(new Request("http://localhost:3100/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "別名", email, password, termsAccepted: true, privacyAccepted: true }),
    }));

    const existingResponse = await request();
    expect(existingResponse.status).toBe(newResponse.status);
    expect(await body<Record<string, unknown>>(existingResponse)).toEqual(newBody);
    expect(cookieMocks.delete).toHaveBeenCalledTimes(3);
    expect(mailMocks.verification).toHaveBeenCalledTimes(1);
    expect((await request()).status).toBe(429);
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

  it("新端末通知はログイン応答の後に送信する", async () => {
    const email = `${uniqueLabel("integration_auth_new_device_mail")}@invalid.example`;
    const password = `${uniqueLabel("NewDeviceLogin")}A1!`;
    const user = await prisma.user.create({
      data: {
        name: "新端末ログインテスト",
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: new Date(),
        trustedLoginDevices: {
          create: {
            tokenHash: "a".repeat(64),
            clientLabel: "既存端末",
          },
        },
      },
    });

    const response = await login(new Request("http://localhost:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "New Device Test" },
      body: JSON.stringify({ email, password }),
    }));

    expect(response.status).toBe(200);
    expect(await body<{ redirectTo: string }>(response)).toMatchObject({ redirectTo: "/dashboard" });
    expect(nextServerMocks.after).toHaveBeenCalledOnce();
    expect(mailMocks.newDevice).not.toHaveBeenCalled();

    const callback = nextServerMocks.afterCallbacks[0];
    if (!callback) throw new Error("新端末通知の処理が登録されませんでした。");
    await callback();
    expect(mailMocks.newDevice).toHaveBeenCalledOnce();
    expect(mailMocks.newDevice).toHaveBeenCalledWith(expect.objectContaining({ email: user.email }));
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

  it("ログイン・登録・パスワード再設定はサイズ上限超過を413で拒否する", async () => {
    const oversizedBody = JSON.stringify({
      name: "a".repeat(9_000),
      email: "oversized@invalid.example",
      password: "oversized",
      termsAccepted: true,
      privacyAccepted: true,
    });
    const createRequest = (path: string) => new Request(`http://localhost:3100${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: oversizedBody,
    });

    const responses = await Promise.all([
      login(createRequest("/api/auth/login")),
      register(createRequest("/api/auth/register")),
      forgotPassword(createRequest("/api/auth/forgot-password")),
    ]);

    expect(responses.map((response) => response.status)).toEqual([413, 413, 413]);
    expect(mailMocks.verification).not.toHaveBeenCalled();
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

  it("アカウントロック中は正しいパスワードでもログインできない", async () => {
    const email = `${uniqueLabel("integration_auth_locked")}@invalid.example`;
    const password = `${uniqueLabel("Locked")}A1!`;
    const lockedUntil = new Date(Date.now() + 60_000);
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: new Date(),
        lockedUntil,
      },
    });
    const compareSpy = vi.spyOn(bcrypt, "compare");
    const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.33" },
      body: JSON.stringify({ email, password }),
    }));
    expect(response.status).toBe(429);
    expect(compareSpy).not.toHaveBeenCalled();
    expect(cookieMocks.set).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).lockedUntil?.getTime()).toBe(lockedUntil.getTime());
  });

  it("アカウントロック中の誤ったパスワードも送信元制限に記録する", async () => {
    const email = `${uniqueLabel("integration_auth_locked_wrong")}@invalid.example`;
    const password = `${uniqueLabel("LockedWrong")}A1!`;
    const clientIp = "192.0.2.34";
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 4),
        emailVerified: new Date(),
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    for (let attempt = 0; attempt < AUTH_RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
      const response = await login(new Request("http://127.0.0.1:3100/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": clientIp },
        body: JSON.stringify({ email, password: "incorrect password" }),
      }));
      expect(response.status).toBe(429);
    }
    expect(isAuthRateLimited(authAttemptKey(email, clientIp, env.authSecret))).toBe(true);
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
