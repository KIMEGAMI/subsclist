import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  customerRetrieve: vi.fn(),
  customerList: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
  portalCreate: vi.fn(),
  profileSync: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    customers: { retrieve: stripeMocks.customerRetrieve, list: stripeMocks.customerList },
    subscriptions: { retrieve: stripeMocks.subscriptionRetrieve, list: stripeMocks.subscriptionList },
    billingPortal: { sessions: { create: stripeMocks.portalCreate } },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  activePlan: (status: string) => status === "active" || status === "trialing" ? "PREMIUM" : "FREE",
  syncStripeSubscription: vi.fn(async () => true),
}));
vi.mock("@/lib/stripe-customer-profile", () => ({
  syncStripeCustomerProfile: stripeMocks.profileSync,
}));

import { POST } from "@/app/api/stripe/portal/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  stripeMocks.customerList.mockResolvedValue({ data: [] });
  stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
  stripeMocks.profileSync.mockResolvedValue(true);
  stripeMocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Stripe Portal", () => {
  it("未ログインを拒否する", async () => {
    expect((await POST()).status).toBe(401);
  });

  it("所有者metadataが一致する顧客だけでPortalを作成する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ url: "https://billing.stripe.test/session" });
    expect(stripeMocks.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_owned" }));
  });

  it("別ユーザーmetadataの顧客ではPortalを作成せず識別子を解除する", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_foreign" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_foreign", deleted: false, metadata: { userId: other.id } });

    const response = await POST();

    expect(response.status).toBe(409);
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).stripeCustomerId).toBeNull();
  });

  it("顧客プロフィールの所有者を確認できない場合はPortalを開かない", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_unverified" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_unverified", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.profileSync.mockResolvedValue(false);
    const response = await POST();
    expect(response.status).toBe(409);
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
  });
});
