import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import {
  DELETE as clearScheduledPrice,
  PATCH as applyScheduledPrice,
  PUT as saveScheduledPrice,
} from "@/app/api/subscriptions/[id]/scheduled-price/route";
import {
  DELETE as deleteAlias,
  POST as saveAlias,
} from "@/app/api/subscriptions/[id]/statement-aliases/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("ScheduledPrice"),
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

function jsonRequest(path: string, payload: object, method = "POST") {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("価格変更予約", () => {
  it("Premiumが予約を保存し、現在価格への反映時に旧価格の履歴を残す", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    const save = await saveScheduledPrice(jsonRequest(`/api/subscriptions/${item.id}/scheduled-price`, {
      price: 1280,
      effectiveAt: "2099-01-01",
    }, "PUT"), { params: Promise.resolve({ id: item.id }) });
    expect(save.status).toBe(200);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ scheduledPrice: 1280 });

    const apply = await applyScheduledPrice(new Request("http://127.0.0.1:3100", { method: "PATCH" }), { params: Promise.resolve({ id: item.id }) });
    expect(apply.status).toBe(200);
    expect(await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ price: 1280, scheduledPrice: null, scheduledPriceAt: null });
    expect(await prisma.subscriptionPriceHistory.findFirst({ where: { userId: owner.id, subscriptionId: item.id, price: 980 } })).not.toBeNull();
  });

  it("予約解除と入力検証を行う", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    expect((await saveScheduledPrice(jsonRequest("/scheduled-price", { price: 980, effectiveAt: "2099-01-01" }, "PUT"), { params: Promise.resolve({ id: item.id }) })).status).toBe(400);
    expect((await saveScheduledPrice(jsonRequest("/scheduled-price", { price: 1280, effectiveAt: "2000-01-01" }, "PUT"), { params: Promise.resolve({ id: item.id }) })).status).toBe(400);

    await prisma.subscription.update({ where: { id: item.id }, data: { scheduledPrice: 1280, scheduledPriceAt: new Date("2099-01-01T00:00:00.000Z") } });
    expect((await clearScheduledPrice(new Request("http://127.0.0.1:3100", { method: "DELETE" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).scheduledPrice).toBeNull();
  });

  it("Freeの新規予約と他ユーザー契約への操作を拒否する", async () => {
    const free = await user({ plan: "FREE" });
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const owned = await subscription(owner.id);
    authState.user = free;
    expect((await saveScheduledPrice(jsonRequest("/scheduled-price", { price: 1280, effectiveAt: "2099-01-01" }, "PUT"), { params: Promise.resolve({ id: owned.id }) })).status).toBe(403);
    authState.user = other;
    expect((await clearScheduledPrice(new Request("http://127.0.0.1:3100", { method: "DELETE" }), { params: Promise.resolve({ id: owned.id }) })).status).toBe(404);
    expect((await applyScheduledPrice(new Request("http://127.0.0.1:3100", { method: "PATCH" }), { params: Promise.resolve({ id: owned.id }) })).status).toBe(404);
  });
});

describe("明細名義ルール", () => {
  it("Premiumが名義を追加し、同一契約への再登録は重複作成しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    const first = await saveAlias(jsonRequest(`/api/subscriptions/${item.id}/statement-aliases`, { merchant: "Example Service Tokyo" }), { params: Promise.resolve({ id: item.id }) });
    const firstBody = (await first.json()) as { id: string; created: boolean };
    expect(first.status).toBe(200);
    expect(firstBody.created).toBe(true);
    const duplicate = await saveAlias(jsonRequest(`/api/subscriptions/${item.id}/statement-aliases`, { merchant: "ＥＸＡＭＰＬＥ　ＳＥＲＶＩＣＥ　ＴＯＫＹＯ" }), { params: Promise.resolve({ id: item.id }) });
    expect(await duplicate.json()).toMatchObject({ id: firstBody.id, created: false });
    expect(await prisma.statementMerchantAlias.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("別契約での重複と他ユーザーによる追加・削除を拒否する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const firstSubscription = await subscription(owner.id);
    const secondSubscription = await subscription(owner.id);
    authState.user = owner;
    const createdResponse = await saveAlias(jsonRequest("/statement-aliases", { merchant: "CARD SERVICE 001" }), { params: Promise.resolve({ id: firstSubscription.id }) });
    const created = (await createdResponse.json()) as { id: string };
    expect((await saveAlias(jsonRequest("/statement-aliases", { merchant: "card service 001" }), { params: Promise.resolve({ id: secondSubscription.id }) })).status).toBe(409);

    authState.user = other;
    expect((await saveAlias(jsonRequest("/statement-aliases", { merchant: "OTHER MERCHANT" }), { params: Promise.resolve({ id: firstSubscription.id }) })).status).toBe(404);
    expect((await deleteAlias(jsonRequest("/statement-aliases", { aliasId: created.id }, "DELETE"), { params: Promise.resolve({ id: firstSubscription.id }) })).status).toBe(404);
    expect(await prisma.statementMerchantAlias.findUnique({ where: { id: created.id } })).not.toBeNull();
  });

  it("Freeプランと短すぎる名義を拒否する", async () => {
    const free = await user({ plan: "FREE" });
    const item = await subscription(free.id);
    authState.user = free;
    expect((await saveAlias(jsonRequest("/statement-aliases", { merchant: "VALID MERCHANT" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(403);
    authState.user = await user({ plan: "PREMIUM" });
    const premiumItem = await subscription(authState.user.id);
    expect((await saveAlias(jsonRequest("/statement-aliases", { merchant: "A" }), { params: Promise.resolve({ id: premiumItem.id }) })).status).toBe(400);
  });
});
