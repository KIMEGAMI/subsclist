import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { uniqueLabel } from "../helpers/database";

const webhookState = vi.hoisted(() => ({
  signature: "signature",
  event: {
    id: "evt_initial",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_integration", status: "active" } },
  } as { id: string; type: string; data: { object: { id: string; status: string } } },
  constructError: false,
}));
const stripeMocks = vi.hoisted(() => ({
  retrieve: vi.fn(async () => ({ id: "sub_integration", status: "active" })),
}));
const billingMocks = vi.hoisted(() => ({
  checkout: vi.fn(async () => undefined),
  invoice: vi.fn(async () => undefined),
  subscription: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "stripe-signature" ? webhookState.signature : null) }),
}));
vi.mock("@/lib/stripe", () => ({
  stripeForWebhook: () => ({
    webhooks: {
      constructEvent: () => {
        if (webhookState.constructError) throw new Error("invalid signature");
        return webhookState.event;
      },
    },
    subscriptions: stripeMocks,
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  syncStripeCheckoutSession: billingMocks.checkout,
  syncStripeInvoiceSubscription: billingMocks.invoice,
  syncStripeSubscription: billingMocks.subscription,
}));

import { POST } from "@/app/api/stripe/webhook/route";

function request() {
  return new Request("http://localhost:3100/api/stripe/webhook", {
    method: "POST",
    body: "{}",
  });
}

afterEach(async () => {
  webhookState.signature = "signature";
  webhookState.constructError = false;
  vi.clearAllMocks();
  await prisma.stripeWebhookEvent.deleteMany({
    where: { id: { startsWith: "evt_integration_" } },
  });
});

describe("Stripe Webhook", () => {
  it("署名欠落を拒否する", async () => {
    webhookState.signature = "";
    expect((await POST(request())).status).toBe(400);
  });

  it("不正署名を拒否する", async () => {
    webhookState.constructError = true;
    expect((await POST(request())).status).toBe(400);
    expect(billingMocks.subscription).not.toHaveBeenCalled();
  });

  it("同じevent IDを二重処理しない", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_integration"),
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    };
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    expect(billingMocks.subscription).toHaveBeenCalledTimes(1);
  });

  it("同じevent IDが同時配信されても同期処理を一度だけ実行する", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_integration_concurrent"),
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    };
    billingMocks.subscription.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => body.duplicate === true)).toHaveLength(1);
    expect(billingMocks.subscription).toHaveBeenCalledTimes(1);
  });
});
