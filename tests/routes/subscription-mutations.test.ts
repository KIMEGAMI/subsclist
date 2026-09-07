import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : {
          ok: false as const,
          response: Response.json({ message: "ログインしてください。" }, { status: 401 }),
        },
}));

import { DELETE, PUT } from "@/app/api/subscriptions/[id]/route";

const createdUserIds: string[] = [];

async function user() {
  const created = await createTestUser();
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("MutationSubscription"),
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

function putRequest(payload: object) {
  return new Request("http://127.0.0.1:3100/api/subscriptions/id", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Subscription更新・削除の所有者境界", () => {
  it("所有者の更新を保存し価格履歴を作成する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;

    const response = await PUT(putRequest({ price: 1280 }), {
      params: Promise.resolve({ id: item.id }),
    });

    expect(response.status).toBe(200);
    expect(await prisma.subscription.findUnique({ where: { id: item.id } })).toMatchObject({
      price: 1280,
      userId: owner.id,
    });
    expect(await prisma.subscriptionPriceHistory.findFirst({
      where: { subscriptionId: item.id },
    })).toMatchObject({ price: 980, userId: owner.id });
  });

  it("他ユーザーによる更新を404で拒否しDBを変更しない", async () => {
    const owner = await user();
    const attacker = await user();
    const item = await subscription(owner.id);
    authState.user = attacker;

    const response = await PUT(putRequest({ price: 1 }), {
      params: Promise.resolve({ id: item.id }),
    });

    expect(response.status).toBe(404);
    expect(await prisma.subscription.findUnique({ where: { id: item.id } })).toMatchObject({
      price: 980,
      deletedAt: null,
    });
  });

  it("他ユーザーによる削除を拒否する", async () => {
    const owner = await user();
    const attacker = await user();
    const item = await subscription(owner.id);
    authState.user = attacker;

    const response = await DELETE(new Request("http://127.0.0.1:3100"), {
      params: Promise.resolve({ id: item.id }),
    });

    expect(response.status).toBe(404);
    expect((await prisma.subscription.findUnique({ where: { id: item.id } }))?.deletedAt).toBeNull();
  });

  it("所有者の削除は物理削除せずdeletedAtを記録する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;

    const response = await DELETE(new Request("http://127.0.0.1:3100"), {
      params: Promise.resolve({ id: item.id }),
    });

    expect(response.status).toBe(200);
    expect((await prisma.subscription.findUnique({ where: { id: item.id } }))?.deletedAt).toBeInstanceOf(Date);
  });
});
