import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { uniqueLabel } from "../helpers/database";

type TestEvent = {
  id: string;
  type: string;
  data: { object: { id: string; status?: string } };
};

const webhookState = vi.hoisted(() => ({
  signature: "integration-signature",
  event: {
    id: "evt_resilience_initial",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_resilience", status: "active" } },
  } as TestEvent,
}));
const stripeMocks = vi.hoisted(() => ({ subscriptionRetrieve: vi.fn() }));
const billingMocks = vi.hoisted(() => ({
  checkout: vi.fn(async () => undefined),
  invoice: vi.fn(async () => undefined),
  subscription: vi.fn(async () => undefined),
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => name === "stripe-signature" ? webhookState.signature : null }),
}));
vi.mock("@/lib/stripe", () => ({
  stripeForWebhook: () => ({
    webhooks: { constructEvent: () => webhookState.event },
    subscriptions: { retrieve: stripeMocks.subscriptionRetrieve },
  }),
}));
vi.mock("@/lib/stripe-billing", () => ({
  syncStripeCheckoutSession: billingMocks.checkout,
  syncStripeInvoiceSubscription: billingMocks.invoice,
  syncStripeSubscription: billingMocks.subscription,
}));

import { POST as processWebhook } from "@/app/api/stripe/webhook/route";

function request() {
  return new Request("http://127.0.0.1:3100/api/stripe/webhook", { method: "POST", body: "{}" });
}

afterEach(async () => {
  vi.clearAllMocks();
  stripeMocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_resilience", status: "active" });
  billingMocks.checkout.mockResolvedValue(undefined);
  billingMocks.invoice.mockResolvedValue(undefined);
  billingMocks.subscription.mockResolvedValue(undefined);
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: "evt_resilience_" } } });
});

stripeMocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_resilience", status: "active" });

describe("Stripe Webhookの復旧性", () => {
  it("Checkout完了と請求イベントを対応する同期処理へ振り分ける", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_resilience_checkout"),
      type: "checkout.session.completed",
      data: { object: { id: "cs_completed" } },
    };
    expect((await processWebhook(request())).status).toBe(200);
    expect(billingMocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_completed" }));

    webhookState.event = {
      id: uniqueLabel("evt_resilience_invoice"),
      type: "invoice.payment_failed",
      data: { object: { id: "in_failed" } },
    };
    expect((await processWebhook(request())).status).toBe(200);
    expect(billingMocks.invoice).toHaveBeenCalledWith(expect.objectContaining({ id: "in_failed" }));
  });

  it("処理失敗時はイベント占有を解除し、同じイベントを再試行できる", async () => {
    const eventId = uniqueLabel("evt_resilience_retry");
    webhookState.event = {
      id: eventId,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_retry", status: "active" } },
    };
    stripeMocks.subscriptionRetrieve.mockResolvedValue({ id: "sub_retry", status: "active" });
    billingMocks.subscription.mockRejectedValueOnce(new Error("temporary provider failure"));
    const failed = await processWebhook(request());
    expect(failed.status).toBe(500);
    expect(await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } })).toBeNull();
    expect(JSON.stringify(await failed.json())).not.toContain("temporary provider failure");

    const retried = await processWebhook(request());
    expect(retried.status).toBe(200);
    expect(billingMocks.subscription).toHaveBeenCalledTimes(2);
    expect((await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: eventId } })).processedAt).toBeInstanceOf(Date);
  });

  it("削除済み契約がStripeで見つからない場合は削除イベント本体を使う", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_resilience_deleted"),
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_deleted", status: "canceled" } },
    };
    stripeMocks.subscriptionRetrieve.mockRejectedValue({ code: "resource_missing" });
    const response = await processWebhook(request());
    expect(response.status).toBe(200);
    expect(billingMocks.subscription).toHaveBeenCalledWith(expect.objectContaining({ id: "sub_deleted", status: "canceled" }));
  });

  it("未知イベントも処理済みとして記録し再送を重複扱いする", async () => {
    const eventId = uniqueLabel("evt_resilience_unknown");
    webhookState.event = {
      id: eventId,
      type: "customer.created",
      data: { object: { id: "cus_unknown" } },
    };
    expect((await processWebhook(request())).status).toBe(200);
    const duplicate = await processWebhook(request());
    expect(await duplicate.json()).toEqual({ received: true, duplicate: true });
    expect((await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: eventId } })).processedAt).toBeInstanceOf(Date);
  });
});
