import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, uniqueLabel } from "../helpers/database";

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

import { GET as verifyEmail } from "@/app/api/auth/verify-email/route";
import { GET as verifyEmailChange } from "@/app/api/auth/verify-email-change/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  stripeSyncMock.mockResolvedValue(true);
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("メール認証とメール変更", () => {
  it("有効なメール認証トークンを一度だけ使用する", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("EmailVerificationToken");
    await prisma.emailVerificationToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });

    const first = await verifyEmail(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email?token=${token}`));
    const second = await verifyEmail(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email?token=${token}`));

    expect(first.headers.get("location")).toContain("status=success");
    expect(second.headers.get("location")).toContain("status=invalid");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified).toBeInstanceOf(Date);
    expect(sessionMock).toHaveBeenCalledTimes(1);
  });

  it("期限切れメール認証トークンでは認証しない", async () => {
    const owner = await createTestUser({ verified: false });
    createdUserIds.push(owner.id);
    const token = uniqueLabel("ExpiredEmailToken");
    await prisma.emailVerificationToken.create({
      data: { userId: owner.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1_000) },
    });
    const response = await verifyEmail(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email?token=${token}`));
    expect(response.headers.get("location")).toContain("status=invalid");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified).toBeNull();
  });

  it("メール変更成功時にemail・認証日時・sessionVersionを更新する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    const token = uniqueLabel("EmailChangeToken");
    const newEmail = `${uniqueLabel("changed_email")}@invalid.example`;
    await prisma.emailChangeToken.create({
      data: { userId: owner.id, newEmail, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    const response = await verifyEmailChange(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email-change?token=${token}`));
    expect(response.headers.get("location")).toContain("email-change=success");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      email: newEmail,
      sessionVersion: owner.sessionVersion + 1,
    });
    const second = await verifyEmailChange(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email-change?token=${token}`));
    expect(second.headers.get("location")).toContain("email-change=invalid");
  });

  it("別ユーザーが使用中のメールへの変更を拒否する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    const token = uniqueLabel("ConflictEmailToken");
    await prisma.emailChangeToken.create({
      data: { userId: owner.id, newEmail: other.email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    const response = await verifyEmailChange(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email-change?token=${token}`));
    expect(response.headers.get("location")).toContain("email-change=conflict");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(owner.email);
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
      data: { userId: owner.id, newEmail, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) },
    });
    stripeSyncMock.mockRejectedValueOnce(new Error("Stripe internal detail"));

    const response = await verifyEmailChange(new NextRequest(`http://127.0.0.1:3100/api/auth/verify-email-change?token=${token}`));
    expect(response.headers.get("location")).toContain("email-change=success-stripe-pending");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(newEmail);
    expect(sessionMock).toHaveBeenCalledWith(owner.id, true);
  });
});
