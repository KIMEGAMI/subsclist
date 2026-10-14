import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  deleteTestUsers,
  type TestUser,
} from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  price: vi.fn(),
  customerCreate: vi.fn(),
  customerRetrieve: vi.fn(),
  customerList: vi.fn(),
  subscriptionList: vi.fn(),
  sessionCreate: vi.fn(),
  sessionRetrieve: vi.fn(),
}));
const billingMocks = vi.hoisted(() => ({
  sync: vi.fn(async () => undefined),
  syncCheckout: vi.fn(async () => true),
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
    prices: { retrieve: stripeMocks.price },
    customers: {
      create: stripeMocks.customerCreate,
      retrieve: stripeMocks.customerRetrieve,
      list: stripeMocks.customerList,
    },
    subscriptions: { list: stripeMocks.subscriptionList },
    checkout: {
      sessions: {
        create: stripeMocks.sessionCreate,
        retrieve: stripeMocks.sessionRetrieve,
      },
    },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  hasPremiumStripeStatus: (status: string) =>
    status === "active" || status === "trialing",
  syncStripeCheckoutSession: billingMocks.syncCheckout,
  syncStripeSubscription: billingMocks.sync,
}));
vi.mock("@/lib/stripe-entitlement", () => ({
  stripeSubscriptionCanBeManaged: (status: string) =>
    [
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "incomplete",
      "paused",
    ].includes(status),
}));
vi.mock("@/lib/stripe-customer-profile", () => ({
  syncStripeCustomerProfile: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/stripe/checkout/route";

const createdUserIds: string[] = [];
async function user() {
  const created = await createTestUser({ plan: "FREE" });
  createdUserIds.push(created.id);
  return created;
}
function request() {
  return new Request("http://localhost:3100/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
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

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  stripeMocks.price.mockResolvedValue(validPrice());
  stripeMocks.customerList.mockResolvedValue({ data: [] });
  stripeMocks.customerCreate.mockResolvedValue({ id: "cus_integration" });
  stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
  stripeMocks.sessionCreate.mockResolvedValue({
    id: "cs_integration",
    url: "https://checkout.stripe.test/session",
  });
  stripeMocks.sessionRetrieve.mockResolvedValue({});
  await deleteTestUsers(...createdUserIds.splice(0));
});

stripeMocks.price.mockResolvedValue(validPrice());
stripeMocks.customerList.mockResolvedValue({ data: [] });
stripeMocks.customerCreate.mockResolvedValue({ id: "cus_integration" });
stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
stripeMocks.sessionCreate.mockResolvedValue({
  id: "cs_integration",
  url: "https://checkout.stripe.test/session",
});
stripeMocks.sessionRetrieve.mockResolvedValue({});

describe("Stripe Checkout", () => {
  it("未ログインを拒否する", async () => {
    expect((await POST(request())).status).toBe(401);
  });

  it("月額480円と初回7日trialでCheckoutを作る", async () => {
    const owner = await user();
    authState.user = owner;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
    const params = stripeMocks.sessionCreate.mock.calls[0]?.[0] as {
      mode: string;
      line_items: Array<{ price: string; quantity: number }>;
      subscription_data: {
        trial_period_days?: number;
        metadata: { userId: string };
      };
    };
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([
      { price: "price_integration_placeholder", quantity: 1 },
    ]);
    expect(params.subscription_data.trial_period_days).toBe(7);
    expect(params.subscription_data.metadata.userId).toBe(owner.id);
    expect(stripeMocks.sessionCreate.mock.calls[0]?.[1]).toMatchObject({
      idempotencyKey: expect.stringContaining(owner.id),
    });
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }),
    ).toMatchObject({
      stripeCustomerId: "cus_integration",
      stripeCheckoutSessionId: "cs_integration",
      stripeCheckoutLockToken: null,
      stripeCheckoutLockUntil: null,
    });
  });

  it("並行リクエストはDBロックでCheckoutを1つだけ作成する", async () => {
    const owner = await user();
    authState.user = owner;
    let signalPriceStarted: () => void = () => undefined;
    let releasePrice: () => void = () => undefined;
    const priceStarted = new Promise<void>((resolve) => {
      signalPriceStarted = resolve;
    });
    const priceGate = new Promise<void>((resolve) => {
      releasePrice = resolve;
    });
    stripeMocks.price.mockImplementationOnce(async () => {
      signalPriceStarted();
      await priceGate;
      return validPrice();
    });

    const firstRequest = POST(request());
    await priceStarted;
    const concurrentResponse = await POST(request());
    releasePrice();
    const firstResponse = await firstRequest;

    expect(concurrentResponse.status).toBe(409);
    expect(firstResponse.status).toBe(200);
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("Stripe応答が不明な失敗後は同じ冪等キーで再試行する", async () => {
    const owner = await user();
    authState.user = owner;
    stripeMocks.sessionCreate.mockRejectedValueOnce(
      new Error("connection reset"),
    );

    expect((await POST(request())).status).toBe(500);
    const lockedUser = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(lockedUser.stripeCheckoutLockToken).toBeTruthy();

    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCheckoutLockUntil: new Date(Date.now() - 1_000) },
    });
    stripeMocks.customerRetrieve.mockResolvedValue({
      id: "cus_integration",
      deleted: false,
      metadata: { userId: owner.id },
    });

    expect((await POST(request())).status).toBe(200);

    const firstOptions = stripeMocks.sessionCreate.mock.calls[0]?.[1];
    const retryOptions = stripeMocks.sessionCreate.mock.calls[1]?.[1];
    expect(retryOptions).toEqual(firstOptions);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCheckoutSessionId,
    ).toBe("cs_integration");
  });

  it("未完了のCheckout Sessionがあれば同じURLを再利用する", async () => {
    const owner = await user();
    authState.user = owner;
    expect((await POST(request())).status).toBe(200);
    stripeMocks.sessionRetrieve.mockResolvedValue({
      id: "cs_integration",
      status: "open",
      url: "https://checkout.stripe.test/session",
      customer: "cus_integration",
      metadata: { userId: owner.id },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(stripeMocks.sessionRetrieve).toHaveBeenCalledWith("cs_integration");
  });

  it("別Stripeアカウントで保存済みSessionが見つからなくてもIDを保持して停止する", async () => {
    const owner = await user();
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        stripeCustomerId: "cus_from_previous_account",
        stripeCheckoutSessionId: "cs_from_previous_account",
      },
    });
    authState.user = owner;
    stripeMocks.sessionRetrieve.mockRejectedValue({
      code: "resource_missing",
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(stripeMocks.customerCreate).not.toHaveBeenCalled();
    expect(stripeMocks.sessionCreate).not.toHaveBeenCalled();
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }),
    ).toMatchObject({
      stripeCustomerId: "cus_from_previous_account",
      stripeCheckoutSessionId: "cs_from_previous_account",
    });
  });

  it("完了済みのCheckout Sessionを同期して保存済みIDを消す", async () => {
    const owner = await user();
    authState.user = owner;
    expect((await POST(request())).status).toBe(200);
    stripeMocks.sessionRetrieve.mockResolvedValue({
      id: "cs_integration",
      status: "complete",
      customer: "cus_integration",
      metadata: { userId: owner.id },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(billingMocks.syncCheckout).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCheckoutSessionId,
    ).toBeNull();
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("他ユーザー所有の保存済みCheckout Sessionを拒否する", async () => {
    const owner = await user();
    authState.user = owner;
    expect((await POST(request())).status).toBe(200);
    stripeMocks.sessionRetrieve.mockResolvedValue({
      id: "cs_integration",
      status: "open",
      url: "https://checkout.stripe.test/session",
      customer: "cus_integration",
      metadata: { userId: "another_user" },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
    expect(billingMocks.syncCheckout).not.toHaveBeenCalled();
  });

  it("完了済みSessionの同期が失敗したらIDを保持して二つ目を作らない", async () => {
    const owner = await user();
    authState.user = owner;
    expect((await POST(request())).status).toBe(200);
    stripeMocks.sessionRetrieve.mockResolvedValue({
      id: "cs_integration",
      status: "complete",
      customer: "cus_integration",
      metadata: { userId: owner.id },
    });
    billingMocks.syncCheckout.mockResolvedValueOnce(false);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .stripeCheckoutSessionId,
    ).toBe("cs_integration");
    expect(stripeMocks.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("金額が480円でないPriceではCheckoutを作らない", async () => {
    authState.user = await user();
    stripeMocks.price.mockResolvedValue({ ...validPrice(), unit_amount: 980 });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(stripeMocks.sessionCreate).not.toHaveBeenCalled();
    expect((await response.json()) as { message: string }).toMatchObject({
      message: expect.stringContaining("480円"),
    });
  });

  it("有効な既存契約があれば二重Checkoutを作らない", async () => {
    const owner = await user();
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_existing", trialUsedAt: new Date() },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({
      id: "cus_existing",
      deleted: false,
      metadata: { userId: owner.id },
    });
    stripeMocks.subscriptionList.mockResolvedValue({
      data: [{ id: "sub_existing", status: "active" }],
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(stripeMocks.sessionCreate).not.toHaveBeenCalled();
    expect(billingMocks.sync).toHaveBeenCalledTimes(1);
  });

  it.each(["unpaid", "incomplete", "paused"])(
    "%sの既存契約がある場合は新しいCheckoutを作らない",
    async (status) => {
      const owner = await user();
      await prisma.user.update({
        where: { id: owner.id },
        data: { stripeCustomerId: "cus_existing", trialUsedAt: new Date() },
      });
      authState.user = owner;
      stripeMocks.customerRetrieve.mockResolvedValue({
        id: "cus_existing",
        deleted: false,
        metadata: { userId: owner.id },
      });
      stripeMocks.subscriptionList.mockResolvedValue({
        data: [{ id: "sub_existing", status }],
      });

      const response = await POST(request());

      expect(response.status).toBe(409);
      expect((await response.json()) as { message: string }).toMatchObject({
        message: expect.stringContaining("契約・解約"),
      });
      expect(stripeMocks.sessionCreate).not.toHaveBeenCalled();
      expect(billingMocks.sync).toHaveBeenCalledTimes(1);
    },
  );
});
