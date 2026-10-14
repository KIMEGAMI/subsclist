import { afterEach, describe, expect, it, vi } from "vitest";
import { resetBillingRateLimitForTests } from "@/lib/billing-rate-limit";
import { MAX_BILLING_REQUEST_BODY_BYTES } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  deleteTestUsers,
  type TestUser,
} from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  priceRetrieve: vi.fn(),
  customerCreate: vi.fn(),
  customerRetrieve: vi.fn(),
  customerList: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionList: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutRetrieve: vi.fn(),
  portalCreate: vi.fn(),
  profileSync: vi.fn(),
  subscriptionSync: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : {
          ok: false as const,
          response: Response.json(
            { message: "ログインしてください。" },
            { status: 401 },
          ),
        },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    prices: { retrieve: stripeMocks.priceRetrieve },
    customers: {
      create: stripeMocks.customerCreate,
      retrieve: stripeMocks.customerRetrieve,
      list: stripeMocks.customerList,
    },
    subscriptions: {
      retrieve: stripeMocks.subscriptionRetrieve,
      list: stripeMocks.subscriptionList,
    },
    checkout: {
      sessions: {
        create: stripeMocks.checkoutCreate,
        retrieve: stripeMocks.checkoutRetrieve,
      },
    },
    billingPortal: { sessions: { create: stripeMocks.portalCreate } },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  activePlan: (status: string) =>
    status === "active" || status === "trialing" ? "PREMIUM" : "FREE",
  hasPremiumStripeStatus: (status: string) =>
    status === "active" || status === "trialing",
  syncStripeSubscription: stripeMocks.subscriptionSync,
}));
vi.mock("@/lib/stripe-customer-profile", () => ({
  syncStripeCustomerProfile: stripeMocks.profileSync,
}));

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
    headers: htmlRedirect
      ? { accept: "text/html" }
      : { "content-type": "application/json" },
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
  stripeMocks.checkoutCreate.mockResolvedValue({
    id: "cs_resilience",
    url: "https://checkout.stripe.test/session",
  });
  stripeMocks.checkoutRetrieve.mockResolvedValue({});
  stripeMocks.portalCreate.mockResolvedValue({
    url: "https://billing.stripe.test/session",
  });
  stripeMocks.profileSync.mockResolvedValue(true);
  stripeMocks.subscriptionSync.mockResolvedValue(true);
  await deleteTestUsers(...createdUserIds.splice(0));
});

stripeMocks.priceRetrieve.mockResolvedValue(validPrice());
stripeMocks.customerList.mockResolvedValue({ data: [] });
stripeMocks.customerCreate.mockResolvedValue({ id: "cus_new_owned" });
stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
stripeMocks.checkoutCreate.mockResolvedValue({
  id: "cs_resilience",
  url: "https://checkout.stripe.test/session",
});
stripeMocks.checkoutRetrieve.mockResolvedValue({});
stripeMocks.portalCreate.mockResolvedValue({
  url: "https://billing.stripe.test/session",
});
stripeMocks.profileSync.mockResolvedValue(true);
stripeMocks.subscriptionSync.mockResolvedValue(true);

describe("Stripe Checkoutの復旧性", () => {
  it("Checkoutの過大なJSON本文をStripe API呼び出し前に拒否する", async () => {
    const owner = await user({ plan: "FREE" });
    authState.user = owner;
    const request = new Request("http://127.0.0.1:3100/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        value: "x".repeat(MAX_BILLING_REQUEST_BODY_BYTES),
      }),
    });

    const response = await createCheckout(request);

    expect(response.status).toBe(413);
    expect(stripeMocks.priceRetrieve).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("別ユーザー所有の保存済み顧客を検出したら紐付けを保持して停止する", async () => {
    const owner = await user({ plan: "FREE" });
    const other = await user();
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_foreign" },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({
      id: "cus_foreign",
      deleted: false,
      metadata: { userId: other.id },
    });

    const response = await createCheckout(checkoutRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("紐付けは保持"),
    });
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCustomerId,
    ).toBe("cus_foreign");
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCheckoutLockToken,
    ).toBeNull();
  });

  it("別Stripeアカウントで顧客IDが見つからなくても再作成・上書きしない", async () => {
    const owner = await user({ plan: "FREE" });
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_from_previous_account" },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      param: "customer",
    });

    const response = await createCheckout(checkoutRequest());

    expect(response.status).toBe(409);
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(stripeMocks.checkoutCreate).not.toHaveBeenCalled();
    const savedUser = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(savedUser.stripeCustomerId).toBe("cus_from_previous_account");
    expect(savedUser.stripeCheckoutLockToken).toBeNull();
  });

  it("Stripe一時障害では保存済み顧客IDを消さず内部エラーを露出しない", async () => {
    const owner = await user({ plan: "FREE" });
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_keep_on_failure" },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockRejectedValue(
      new Error("provider secret detail"),
    );
    const response = await createCheckout(checkoutRequest());
    expect(response.status).toBe(500);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCustomerId,
    ).toBe("cus_keep_on_failure");
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(
      "provider secret detail",
    );
  });

  it("ブラウザ遷移要求では303でStripe Checkoutへ移動する", async () => {
    authState.user = await user({ plan: "FREE" });
    const response = await createCheckout(checkoutRequest(true));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://checkout.stripe.test/session",
    );
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
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeSubscriptionId: "sub_owned" },
    });
    authState.user = owner;
    stripeMocks.subscriptionRetrieve.mockResolvedValue({
      id: "sub_owned",
      status: "active",
      customer: "cus_recovered",
      metadata: { userId: owner.id },
    });
    stripeMocks.customerRetrieve.mockResolvedValue({
      id: "cus_recovered",
      deleted: false,
      metadata: { userId: owner.id },
    });

    const response = await createPortal();
    expect(response.status).toBe(200);
    expect(stripeMocks.subscriptionSync).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_owned" }),
    );
    expect(stripeMocks.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_recovered" }),
    );
  });

  it("Portal作成失敗時にStripe内部エラーを露出しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_owned" },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({
      id: "cus_owned",
      deleted: false,
      metadata: { userId: owner.id },
    });
    stripeMocks.portalCreate.mockRejectedValue(
      new Error("provider secret detail"),
    );
    const response = await createPortal();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(
      "provider secret detail",
    );
  });
});
