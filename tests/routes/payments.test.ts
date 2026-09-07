import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST } from "@/app/api/payment-histories/route";

const createdUserIds: string[] = [];
async function user() {
  const created = await createTestUser();
  createdUserIds.push(created.id);
  return created;
}
async function subscription(userId: string, name: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name,
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
      status: "ACTIVE",
      businessUsePercent: 60,
    },
  });
}
function request(subscriptionId: string) {
  return new Request("http://localhost:3100/api/payment-histories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscriptionId,
      amount: 980,
      paidAt: "2026-09-01",
      accountingLabel: "通信費",
      rememberAccountingLabel: false,
    }),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("支払い履歴と所有者分離", () => {
  it("他ユーザーのSubscriptionへ支払いを登録できない", async () => {
    const owner = await user();
    const other = await user();
    const target = await subscription(other.id, uniqueLabel("OtherPayment"));
    authState.user = owner;
    const response = await POST(request(target.id));
    expect(response.status).toBe(404);
    expect(await prisma.paymentHistory.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("所有するSubscriptionの名称と仕事利用割合をsnapshot保存する", async () => {
    const owner = await user();
    const name = uniqueLabel("OwnerPayment");
    const target = await subscription(owner.id, name);
    authState.user = owner;
    const response = await POST(request(target.id));
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    expect(await prisma.paymentHistory.findUnique({ where: { id } })).toMatchObject({
      userId: owner.id,
      subscriptionId: target.id,
      subscriptionNameSnapshot: name,
      businessUsePercent: 60,
      accountingLabel: "通信費",
    });
  });

  it("同じ契約・日付・金額の重複を拒否する", async () => {
    const owner = await user();
    const target = await subscription(owner.id, uniqueLabel("DuplicatePayment"));
    authState.user = owner;
    expect((await POST(request(target.id))).status).toBe(200);
    const duplicate = await POST(request(target.id));
    expect(duplicate.status).toBe(409);
    expect(await prisma.paymentHistory.count({ where: { userId: owner.id } })).toBe(1);
  });
});
