import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth";
import { AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS } from "@/lib/app-constants";
import {
  authTokenLookupKey,
  claimAuthTokenLookup,
  resetAuthTokenLookupRateLimitForTests,
} from "@/lib/auth-token-rate-limit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  deleteTestUsers,
  uniqueLabel,
} from "../helpers/database";

const sessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const stripeSyncMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, setSession: sessionMock };
});
vi.mock("@/lib/stripe", () => ({ stripe: vi.fn(() => ({})) }));
vi.mock("@/lib/stripe-customer-profile", () => ({
  syncStripeCustomerProfile: stripeSyncMock,
}));

import { GET as openVerificationLink, POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { GET as openEmailChangeLink, POST as verifyEmailChange } from "@/app/api/auth/verify-email-change/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetAuthTokenLookupRateLimitForTests();
  stripeSyncMock.mockResolvedValue(true);
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("メール認証とメール変更", () => {
  it("リンクのプレビューでは認証せず、本人が設定したパスワードで一度だけ認証する", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("EmailVerificationToken");
    const newPassword = `${uniqueLabel("OwnerChosenPassword")}A1!`;
    await prisma.emailVerificationToken.create({
      data: {
        userId: owner.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const opened = await openVerificationLink(new NextRequest(
      `http://127.0.0.1:3100/api/auth/verify-email?token=${token}`,
    ));
    expect(opened.headers.get("location")).toContain(`/verify-email?token=${encodeURIComponent(token)}`);
    expect(opened.headers.get("cache-control")).toBe("no-store");
    expect(opened.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified).toBeNull();
    expect(sessionMock).not.toHaveBeenCalled();

    const makeRequest = () => new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword, newPasswordConfirm: newPassword }),
    });
    const first = await verifyEmail(makeRequest());
    const second = await verifyEmail(makeRequest());

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, redirectTo: "/dashboard" });
    expect(second.status).toBe(400);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(saved.emailVerified).toBeInstanceOf(Date);
    expect(saved.sessionVersion).toBe(owner.sessionVersion + 1);
    expect(await bcrypt.compare(newPassword, saved.passwordHash)).toBe(true);
    expect(sessionMock).toHaveBeenCalledTimes(1);
  });

  it("既存SHA-256形式のメール認証トークンを移行期間中に受け付ける", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("LegacySha256VerificationToken");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.emailVerificationToken.create({
      data: {
        userId: owner.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const password = `${uniqueLabel("LegacyTokenOwnerPassword")}A1!`;
    const response = await verifyEmail(new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password, newPasswordConfirm: password }),
    }));
    expect(response.status).toBe(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .emailVerified,
    ).toBeInstanceOf(Date);
  });

  it("期限切れメール認証トークンでは認証しない", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("ExpiredEmailToken");
    await prisma.emailVerificationToken.create({
      data: {
        userId: owner.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const password = `${uniqueLabel("ExpiredOwnerPassword")}A1!`;
    const response = await verifyEmail(new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password, newPasswordConfirm: password }),
    }));
    expect(response.status).toBe(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .emailVerified,
    ).toBeNull();
  });

  it("公開メール認証ルートで送信元の旧scrypt照合上限を超えない", async () => {
    const client = "203.0.113.42";
    const lookupKey = authTokenLookupKey(client, env.authSecret);
    for (
      let attempt = 0;
      attempt < AUTH_TOKEN_LOOKUP_MAX_ATTEMPTS;
      attempt += 1
    ) {
      expect(claimAuthTokenLookup(lookupKey)).toBe(true);
    }

    const scrypt = vi.spyOn(crypto, "scrypt");
    const lookup = vi.spyOn(prisma.emailVerificationToken, "findUnique");
    const response = await verifyEmail(new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": client },
      body: JSON.stringify({ token: "invalid-token-value-123456", newPassword: "A-long-enough-password1", newPasswordConfirm: "A-long-enough-password1" }),
    }));

    expect(response.status).toBe(400);
    expect(scrypt).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("メール変更リンクのGETでは変更せず、確認用ページへ移動する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("EmailChangePreviewToken");
    const newEmail = `${uniqueLabel("preview_email")}@invalid.example`;
    await prisma.emailChangeToken.create({
      data: { userId: owner.id, newEmail, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });

    const response = await openEmailChangeLink(new NextRequest(
      `http://127.0.0.1:3100/api/auth/verify-email-change?token=${token}`,
    ));

    expect(response.headers.get("location")).toContain(`/verify-email-change?token=${encodeURIComponent(token)}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(owner.email);
    expect((await prisma.emailChangeToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).usedAt).toBeNull();
    expect(sessionMock).not.toHaveBeenCalled();
  });

  it("無効な認証リンクのリダイレクトにもトークン保護ヘッダーを付ける", async () => {
    const verification = await openVerificationLink(new NextRequest(
      "http://127.0.0.1:3100/api/auth/verify-email?token=invalid",
    ));
    const emailChange = await openEmailChangeLink(new NextRequest(
      "http://127.0.0.1:3100/api/auth/verify-email-change?token=invalid",
    ));

    for (const response of [verification, emailChange]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
  });

  it("認証後に残った別の認証トークンも失効する", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("PrimaryVerificationToken");
    const staleToken = uniqueLabel("StaleVerificationToken");
    const password = `${uniqueLabel("VerifiedOwnerPassword")}A1!`;
    await prisma.emailVerificationToken.createMany({
      data: [token, staleToken].map((value) => ({
        userId: owner.id,
        tokenHash: hashToken(value),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    const response = await verifyEmail(new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword: password, newPasswordConfirm: password }),
    }));
    expect(response.status).toBe(200);
    expect(await prisma.emailVerificationToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(0);
  });

  it("既に認証済みのアカウントを古いメールリンクで変更しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("AlreadyVerifiedToken");
    const newPassword = `${uniqueLabel("UnexpectedPasswordChange")}A1!`;
    await prisma.emailVerificationToken.create({
      data: {
        userId: owner.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await verifyEmail(new Request("http://127.0.0.1:3100/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword, newPasswordConfirm: newPassword }),
    }));

    expect(response.status).toBe(400);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(saved.passwordHash).toBe(owner.passwordHash);
    expect(saved.sessionVersion).toBe(owner.sessionVersion);
  });

  it("メール変更成功時にemail・認証日時・sessionVersionを更新する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("EmailChangeToken");
    const newEmail = `${uniqueLabel("changed_email")}@invalid.example`;
    await prisma.emailChangeToken.create({
      data: {
        userId: owner.id,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const response = await verifyEmailChange(new Request("http://127.0.0.1:3100/api/auth/verify-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }));
    expect(response.headers.get("location")).toContain("email-change=success");
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }),
    ).toMatchObject({
      email: newEmail,
      sessionVersion: owner.sessionVersion + 1,
    });
    const second = await verifyEmailChange(new Request("http://127.0.0.1:3100/api/auth/verify-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }));
    expect(second.headers.get("location")).toContain("email-change=invalid");
  });

  it("別ユーザーが使用中のメールへの変更を拒否する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    const token = uniqueLabel("ConflictEmailToken");
    await prisma.emailChangeToken.create({
      data: {
        userId: owner.id,
        newEmail: other.email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const response = await verifyEmailChange(new Request("http://127.0.0.1:3100/api/auth/verify-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }));
    expect(response.headers.get("location")).toContain("email-change=conflict");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email,
    ).toBe(owner.email);
  });

  it("Stripe同期に失敗してもメール変更を確定し、同期保留として案内する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: uniqueLabel("cus_test") },
    });
    const token = uniqueLabel("StripePendingEmailToken");
    const newEmail = `${uniqueLabel("stripe_pending_email")}@invalid.example`;
    await prisma.emailChangeToken.create({
      data: {
        userId: owner.id,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    stripeSyncMock.mockRejectedValueOnce(new Error("Stripe internal detail"));

    const response = await verifyEmailChange(new Request("http://127.0.0.1:3100/api/auth/verify-email-change", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    }));
    expect(response.headers.get("location")).toContain(
      "email-change=success-stripe-pending",
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email,
    ).toBe(newEmail);
    expect(sessionMock).toHaveBeenCalledWith(owner.id, true);
  });
});
