import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers } from "../helpers/database";

const stripeMocks = vi.hoisted(() => ({
  customerList: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    customers: { list: stripeMocks.customerList },
    subscriptions: {
      retrieve: stripeMocks.subscriptionRetrieve,
      list: stripeMocks.subscriptionList,
    },
  }),
}));

import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe-billing";

const createdUserIds: string[] = [];

async function premiumUser(data: { customerId?: string; subscriptionId?: string }) {
  const user = await createTestUser({ plan: "PREMIUM" });
  createdUserIds.push(user.id);
  return prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: data.customerId,
      stripeSubscriptionId: data.subscriptionId,
      stripeSubscriptionStatus: "active",
    },
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Stripe同期後のプラン整合性", () => {
  it("現在のStripeモードで保存済み契約を確認できない場合はDB情報を維持する", async () => {
    const owner = await premiumUser({ subscriptionId: "sub_stale" });
    stripeMocks.subscriptionRetrieve.mockRejectedValueOnce({ code: "resource_missing" });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("stripe_account_mismatch");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "PREMIUM",
      stripeSubscriptionId: "sub_stale",
      stripeSubscriptionStatus: "active",
    });
  });

  it("現在のStripeモードで顧客を確認できない場合は識別子とPremium権限を維持する", async () => {
    const owner = await premiumUser({ customerId: "cus_stale" });
    stripeMocks.subscriptionList.mockRejectedValueOnce({ code: "resource_missing", param: "customer" });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("stripe_account_mismatch");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "PREMIUM",
      stripeCustomerId: "cus_stale",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: "active",
    });
  });

  it("Stripe IDがないFreeユーザーを正常なFree状態として返す", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    createdUserIds.push(owner.id);
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeSubscriptionStatus: "active" },
    });

    stripeMocks.customerList.mockResolvedValueOnce({ data: [] });
    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("free");
    expect(stripeMocks.customerList).toHaveBeenCalledWith({ email: owner.email, limit: 10 });
    expect(stripeMocks.subscriptionRetrieve).not.toHaveBeenCalled();
    expect(stripeMocks.subscriptionList).not.toHaveBeenCalled();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "FREE",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
    });
  });

  it("Stripe IDのないPremiumの権限を照合失敗だけで解除しない", async () => {
    const owner = await premiumUser({});
    stripeMocks.customerList.mockResolvedValueOnce({ data: [] });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("stripe_account_mismatch");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "PREMIUM",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: "active",
    });
  });

  it("IDが欠落しても本人metadataに一致する契約をメールから復旧する", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    createdUserIds.push(owner.id);
    stripeMocks.customerList.mockResolvedValueOnce({
      data: [{ id: "cus_recovered", metadata: { userId: owner.id } }],
    });
    stripeMocks.subscriptionList.mockResolvedValueOnce({
      data: [{
        id: "sub_recovered",
        status: "active",
        customer: "cus_recovered",
        items: { data: [{ current_period_end: 1_800_000_000 }] },
        metadata: { userId: owner.id },
      }],
    });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("premium");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "PREMIUM",
      stripeCustomerId: "cus_recovered",
      stripeSubscriptionId: "sub_recovered",
      stripeSubscriptionStatus: "active",
    });
  });

  it("メール一致だけでは他人の契約を復旧しない", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    stripeMocks.customerList.mockResolvedValueOnce({
      data: [{ id: "cus_foreign", metadata: { userId: other.id } }],
    });
    stripeMocks.subscriptionList.mockResolvedValueOnce({
      data: [{
        id: "sub_foreign",
        status: "active",
        customer: "cus_foreign",
        metadata: { userId: other.id },
      }],
    });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("free");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "FREE",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  });

  it("Stripe顧客に契約が存在しない場合はFreeへ戻し顧客IDは維持する", async () => {
    const owner = await premiumUser({ customerId: "cus_without_subscription" });
    stripeMocks.subscriptionList.mockResolvedValueOnce({ data: [] });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("not_found");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "FREE",
      stripeCustomerId: "cus_without_subscription",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
    });
  });

  it("Stripeの一時的な通信失敗ではPremium権限と識別子を変更しない", async () => {
    const owner = await premiumUser({ customerId: "cus_temporary_failure" });
    stripeMocks.subscriptionList.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(syncLatestStripeSubscriptionForUser(owner.id)).rejects.toThrow("provider unavailable");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "PREMIUM",
      stripeCustomerId: "cus_temporary_failure",
      stripeSubscriptionStatus: "active",
    });
  });
});
