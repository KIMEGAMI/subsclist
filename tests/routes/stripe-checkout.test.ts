import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => ({
  price: vi.fn(),
  customerCreate: vi.fn(),
  customerRetrieve: vi.fn(),
  customerList: vi.fn(),
  subscriptionList: vi.fn(),
  sessionCreate: vi.fn(),
}));
const billingMocks = vi.hoisted(() => ({ sync: vi.fn(async () => undefined) }));

vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
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
    checkout: { sessions: { create: stripeMocks.sessionCreate } },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  hasPremiumStripeStatus: (status: string) => status === "active" || status === "trialing",
  syncStripeSubscription: billingMocks.sync,
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
  stripeMocks.sessionCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
  await deleteTestUsers(...createdUserIds.splice(0));
});

stripeMocks.price.mockResolvedValue(validPrice());
stripeMocks.customerList.mockResolvedValue({ data: [] });
stripeMocks.customerCreate.mockResolvedValue({ id: "cus_integration" });
stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
stripeMocks.sessionCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" });

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
      subscription_data: { trial_period_days?: number; metadata: { userId: string } };
    };
    expect(params.mode).toBe("subscription");
    expect(params.line_items).toEqual([{ price: "price_integration_placeholder", quantity: 1 }]);
    expect(params.subscription_data.trial_period_days).toBe(7);
    expect(params.subscription_data.metadata.userId).toBe(owner.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).stripeCustomerId).toBe("cus_integration");
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
});
