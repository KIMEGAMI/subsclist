import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBillingRateLimitForTests } from "@/lib/billing-rate-limit";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  priceRetrieve: vi.fn(),
  customerCreate: vi.fn(),
  customerRetrieve: vi.fn(),
  customerList: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
  checkoutCreate: vi.fn(),
  portalCreate: vi.fn(),
  profileSync: vi.fn(),
  subscriptionSync: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    prices: { retrieve: stripeMocks.priceRetrieve },
    customers: { create: stripeMocks.customerCreate, retrieve: stripeMocks.customerRetrieve, list: stripeMocks.customerList },
    subscriptions: { retrieve: stripeMocks.subscriptionRetrieve, list: stripeMocks.subscriptionList },
    checkout: { sessions: { create: stripeMocks.checkoutCreate } },
    billingPortal: { sessions: { create: stripeMocks.portalCreate } },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  activePlan: (status: string) => status === "active" || status === "trialing" ? "PREMIUM" : "FREE",
  hasPremiumStripeStatus: (status: string) => status === "active" || status === "trialing",
  syncStripeSubscription: stripeMocks.subscriptionSync,
}));
vi.mock("@/lib/stripe-customer-profile", () => ({ syncStripeCustomerProfile: stripeMocks.profileSync }));

import { POST as createCheckout } from "@/app/api/stripe/checkout/route";
import { POST as createPortal } from "@/app/api/stripe/portal/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function validPrice() {
  return {
    id: "price_integration_placeholder",
    active: true,
    type: "recurring",
    currency: "jpy",
    unit_amount: 480,
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  };
}

function checkoutRequest(htmlRedirect = false) {
  return new Request("http://127.0.0.1:3100/api/stripe/checkout", {
    method: "POST",
    headers: htmlRedirect ? { accept: "text/html" } : { "content-type": "application/json" },
    body: htmlRedirect ? undefined : "{}",
  });
}

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  resetBillingRateLimitForTests();
  stripeMocks.priceRetrieve.mockResolvedValue(validPrice());
  stripeMocks.customerList.mockResolvedValue({ data: [] });
  stripeMocks.customerCreate.mockResolvedValue({ id: "cus_new_owned" });
  stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
  stripeMocks.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
  stripeMocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" });
  stripeMocks.profileSync.mockResolvedValue(true);
  stripeMocks.subscriptionSync.mockResolvedValue(true);
  await deleteTestUsers(...createdUserIds.splice(0));
});

stripeMocks.priceRetrieve.mockResolvedValue(validPrice());
stripeMocks.customerList.mockResolvedValue({ data: [] });
stripeMocks.customerCreate.mockResolvedValue({ id: "cus_new_owned" });
stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
stripeMocks.checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
stripeMocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" });
stripeMocks.profileSync.mockResolvedValue(true);
stripeMocks.subscriptionSync.mockResolvedValue(true);

describe("Stripe Checkoutの復旧性", () => {
  it("別ユーザー所有の保存済み顧客を使わず本人用顧客を再作成する", async () => {
    const owner = await user({ plan: "FREE" });
    const other = await user();
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_foreign" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_foreign", deleted: false, metadata: { userId: other.id } });

    const response = await createCheckout(checkoutRequest());
    expect(response.status).toBe(200);
    expect(stripeMocks.customerCreate).toHaveBeenCalledWith(expect.objectContaining({ email: owner.email, metadata: { userId: owner.id } }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).stripeCustomerId).toBe("cus_new_owned");
    expect(stripeMocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_new_owned" }));
  });

  it("Stripe一時障害では保存済み顧客IDを消さず内部エラーを露出しない", async () => {
    const owner = await user({ plan: "FREE" });
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_keep_on_failure" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockRejectedValue(new Error("provider secret detail"));
    const response = await createCheckout(checkoutRequest());
    expect(response.status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).stripeCustomerId).toBe("cus_keep_on_failure");
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("provider secret detail");
  });

  it("ブラウザ遷移要求では303でStripe Checkoutへ移動する", async () => {
    authState.user = await user({ plan: "FREE" });
    const response = await createCheckout(checkoutRequest(true));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://checkout.stripe.test/session");
  });

  it("Checkout URLが返らない異常応答を成功扱いしない", async () => {
    authState.user = await user({ plan: "FREE" });
    stripeMocks.checkoutCreate.mockResolvedValueOnce({ url: null });
    const response = await createCheckout(checkoutRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("Stripe Checkout"),
    });
  });
});

describe("Stripe Portalの復旧性", () => {
  it("本人所有の契約IDから顧客を復旧してPortalを開く", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await prisma.user.update({ where: { id: owner.id }, data: { stripeSubscriptionId: "sub_owned" } });
    authState.user = owner;
    stripeMocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_owned", status: "active", customer: "cus_recovered", metadata: { userId: owner.id } });
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_recovered", deleted: false, metadata: { userId: owner.id } });

    const response = await createPortal();
    expect(response.status).toBe(200);
    expect(stripeMocks.subscriptionSync).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_owned" }));
    expect(stripeMocks.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_recovered" }));
  });

  it("Portal作成失敗時にStripe内部エラーを露出しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.portalCreate.mockRejectedValue(new Error("provider secret detail"));
    const response = await createPortal();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("provider secret detail");
  });
});
