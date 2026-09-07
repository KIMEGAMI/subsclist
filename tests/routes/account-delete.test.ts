import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  list: vi.fn(),
  retrieve: vi.fn(),
}));
const clearSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/auth", () => ({ clearSession: clearSessionMock }));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({ subscriptions: stripeMocks }),
}));

import { DELETE } from "@/app/api/settings/account/route";

const createdUserIds: string[] = [];
function request(user: TestUser, password = user.password) {
  return new Request("http://localhost:3100/api/settings/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword: password, confirmText: "削除する", email: user.email }),
  });
}

afterEach(async () => {
  authState.user = null;
  stripeMocks.list.mockReset();
  stripeMocks.retrieve.mockReset();
  clearSessionMock.mockReset();
  clearSessionMock.mockResolvedValue(undefined);
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("アカウント削除のfail-closed", () => {
  it("現在のpasswordが違う場合は削除しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    const response = await DELETE(request(owner, `${owner.password}different`));
    expect(response.status).toBe(400);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
  });

  it("Stripe状態を確認できない場合は削除しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_integration" } });
    authState.user = owner;
    stripeMocks.list.mockRejectedValue(new Error("provider unavailable"));
    const response = await DELETE(request(owner));
    expect(response.status).toBe(502);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
  });

  it("課金識別子がないユーザーだけを完全削除する", async () => {
    const owner = await createTestUser();
    authState.user = owner;
    await prisma.category.create({
      data: { userId: owner.id, name: "削除対象カテゴリ", color: "#000000" },
    });
    const item = await prisma.subscription.create({
      data: { userId: owner.id, name: "削除対象契約", price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date() },
    });
    await Promise.all([
      prisma.userPreference.create({ data: { userId: owner.id } }),
      prisma.monthlyClose.create({
        data: {
          userId: owner.id,
          year: 2026,
          month: 9,
          paidAmount: 0,
          businessPaidAmount: 0,
          activeMonthlyAmount: 980,
          activeSubscriptionCount: 1,
          reviewedSubscriptionCount: 0,
          deadlineRiskCount: 0,
        },
      }),
      prisma.trustedLoginDevice.create({ data: { userId: owner.id, tokenHash: "a".repeat(64), clientLabel: "削除対象端末" } }),
      prisma.loginSecurityEvent.create({ data: { userId: owner.id, type: "LOGIN_SUCCESS" } }),
      prisma.geminiAnalysisRequest.create({ data: { userId: owner.id } }),
      prisma.statementMerchantAlias.create({
        data: { userId: owner.id, subscriptionId: item.id, merchantLabel: "DELETE TEST", normalizedMerchant: "delete test" },
      }),
    ]);
    const response = await DELETE(request(owner));
    expect(response.status).toBe(200);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(0);
    expect(await prisma.category.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.monthlyClose.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.trustedLoginDevice.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.loginSecurityEvent.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.geminiAnalysisRequest.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.statementMerchantAlias.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("DB削除後のCookie削除失敗をアカウント削除失敗として返さない", async () => {
    const owner = await createTestUser();
    authState.user = owner;
    clearSessionMock.mockRejectedValueOnce(new Error("cookie store unavailable"));

    const response = await DELETE(request(owner));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(0);
  });
});
