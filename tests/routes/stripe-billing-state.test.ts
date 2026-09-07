import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers } from "../helpers/database";

const stripeMocks = vi.hoisted(() => ({
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
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
  it("保存済み契約が削除済みで顧客IDもない場合はFreeへ戻す", async () => {
    const owner = await premiumUser({ subscriptionId: "sub_stale" });
    stripeMocks.subscriptionRetrieve.mockRejectedValueOnce({ code: "resource_missing" });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("stale_subscription");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      plan: "FREE",
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
    });
  });

  it("保存済み顧客が削除済みの場合は識別子とPremium権限を解除する", async () => {
    const owner = await premiumUser({ customerId: "cus_stale" });
    stripeMocks.subscriptionList.mockRejectedValueOnce({ code: "resource_missing", param: "customer" });

    expect(await syncLatestStripeSubscriptionForUser(owner.id)).toBe("stale_customer");
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
