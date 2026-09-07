import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { DELETE, PATCH, PUT } from "@/app/api/subscriptions/[id]/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("DetailEdge"),
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

function jsonRequest(payload: object, method = "PUT") {
  return new Request("http://127.0.0.1:3100/api/subscriptions/id", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("サブスク個別更新の境界値", () => {
  it("他ユーザーのカテゴリ・支払い方法を関連付けず価格履歴も作らない", async () => {
    const owner = await user();
    const other = await user();
    const item = await subscription(owner.id);
    const foreignCategory = await prisma.category.create({ data: { userId: other.id, name: uniqueLabel("ForeignCategory"), color: "#2563eb" } });
    const foreignPayment = await prisma.paymentMethod.create({ data: { userId: other.id, name: uniqueLabel("ForeignPayment"), type: "CREDIT_CARD" } });
    authState.user = owner;
    const response = await PUT(jsonRequest({ price: 1280, categoryId: foreignCategory.id, paymentMethodId: foreignPayment.id }), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(400);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ price: 980, categoryId: null, paymentMethodId: null });
    expect(await prisma.subscriptionPriceHistory.count({ where: { subscriptionId: item.id } })).toBe(0);
  });

  it("カスタム周期の日数不足を項目名付きで拒否する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await PUT(jsonRequest({ billingCycle: "CUSTOM" }), { params: Promise.resolve({ id: item.id }) });
    const body = (await response.json()) as { fieldErrors?: Record<string, string[]> };
    expect(response.status).toBe(400);
    expect(body.fieldErrors?.customCycleDays?.join(" ")).toContain("周期日数");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).billingCycle).toBe("MONTHLY");
  });

  it("外貨の原通貨額不足を拒否して既存価格を保持する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await PUT(jsonRequest({ price: 1500, currency: "USD", exchangeRateToJpy: "150" }), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(400);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ price: 980, currency: "JPY" });
    expect(await prisma.subscriptionPriceHistory.count({ where: { subscriptionId: item.id } })).toBe(0);
  });

  it("通知設定変更時に利用者の既定通知日数を使用する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    await prisma.userPreference.create({ data: { userId: owner.id, defaultNotifyDaysBefore: 14 } });
    authState.user = owner;
    const response = await PUT(jsonRequest({ notificationsEnabled: false }), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(200);
    expect(await prisma.notificationSetting.findFirst({ where: { userId: owner.id, subscriptionId: item.id } })).toMatchObject({ daysBefore: 14, enabled: false });
  });
});

describe("解約支援と論理削除", () => {
  it("不正な解約予定日を保存しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await PATCH(jsonRequest({ cancellationStatus: "PLANNED", plannedCancelAt: "2026-02-30" }, "PATCH"), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(400);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ cancellationStatus: "NONE", plannedCancelAt: null });
  });

  it("Freeでは解約支援項目を変更できないが通常状態は変更できる", async () => {
    const owner = await user({ plan: "FREE" });
    const item = await subscription(owner.id);
    authState.user = owner;
    expect((await PATCH(jsonRequest({ cancellationStatus: "PLANNED" }, "PATCH"), { params: Promise.resolve({ id: item.id }) })).status).toBe(403);
    expect((await PATCH(jsonRequest({ status: "PAUSED", reviewed: true }, "PATCH"), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "PAUSED", lastReviewedAt: expect.any(Date) });
  });

  it("論理削除後は更新・再削除できず関連履歴は保持する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    await prisma.paymentHistory.create({ data: { userId: owner.id, subscriptionId: item.id, subscriptionNameSnapshot: item.name, amount: 980, paidAt: new Date("2026-09-01T00:00:00.000Z") } });
    authState.user = owner;
    expect((await DELETE(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await PUT(jsonRequest({ price: 1 }), { params: Promise.resolve({ id: item.id }) })).status).toBe(404);
    expect((await DELETE(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: item.id }) })).status).toBe(404);
    expect(await prisma.paymentHistory.count({ where: { subscriptionId: item.id } })).toBe(1);
  });
});
