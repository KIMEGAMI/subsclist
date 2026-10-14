import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_STRIPE_WEBHOOK_BODY_BYTES,
  STRIPE_WEBHOOK_PROCESSING_LEASE_MS,
} from "@/lib/app-constants";
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

function request(body = "{}") {
  return new Request("http://localhost:3100/api/stripe/webhook", {
    method: "POST",
    body,
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

  it("署名検証前に上限超過の本文を拒否する", async () => {
    const response = await POST(request("x".repeat(MAX_STRIPE_WEBHOOK_BODY_BYTES + 1)));

    expect(response.status).toBe(413);
    expect(billingMocks.checkout).not.toHaveBeenCalled();
    expect(billingMocks.invoice).not.toHaveBeenCalled();
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
    expect(await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: webhookState.event.id } })).toMatchObject({
      processedAt: expect.any(Date),
    });
  });

  it("処理中の重複配信には再送を促し、処理済み後は二重処理しない", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_integration_concurrent"),
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    };
    billingMocks.subscription.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 503]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies.filter((body) => body.message?.includes("処理中"))).toHaveLength(1);
    expect(responses.find((response) => response.status === 503)?.headers.get("retry-after")).toBe("60");
    expect(billingMocks.subscription).toHaveBeenCalledTimes(1);

    expect((await POST(request())).status).toBe(200);
    expect(billingMocks.subscription).toHaveBeenCalledTimes(1);
  });

  it("強制終了後に残った期限切れイベントを再取得して処理する", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_integration_stale"),
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    };
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);
    await prisma.stripeWebhookEvent.create({
      data: {
        id: webhookState.event.id,
        type: webhookState.event.type,
        createdAt: startedAt,
        processingStartedAt: startedAt,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(billingMocks.subscription).toHaveBeenCalledTimes(1);
    expect(await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: webhookState.event.id } })).toMatchObject({
      processedAt: expect.any(Date),
    });
  });

  it("古い処理が再取得後に失敗しても新しい処理済み記録を削除しない", async () => {
    webhookState.event = {
      id: uniqueLabel("evt_integration_reclaimed"),
      type: "customer.subscription.updated",
      data: { object: { id: "sub_integration", status: "active" } },
    };
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    billingMocks.subscription.mockImplementationOnce(async () => {
      markFirstStarted();
      await firstGate;
    });

    const firstRequest = POST(request());
    await firstStarted;
    await prisma.stripeWebhookEvent.update({
      where: { id: webhookState.event.id },
      data: {
        processingStartedAt: new Date(
          Date.now() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS - 1,
        ),
      },
    });

    const reclaimedResponse = await POST(request());
    releaseFirst();
    const staleResponse = await firstRequest;

    expect(reclaimedResponse.status).toBe(200);
    expect(staleResponse.status).toBe(500);
    expect(
      await prisma.stripeWebhookEvent.findUniqueOrThrow({
        where: { id: webhookState.event.id },
      }),
    ).toMatchObject({ processedAt: expect.any(Date) });
    expect(billingMocks.subscription).toHaveBeenCalledTimes(2);
  });
});
