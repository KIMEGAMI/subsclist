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

import { POST } from "@/app/api/subscriptions/route";

const createdUserIds: string[] = [];
const validPayload = () => ({
  name: uniqueLabel("RouteSubscription"),
  price: 980,
  billingCycle: "MONTHLY",
  nextBillingDate: "2026-10-01",
  billingProvider: "DIRECT",
  status: "ACTIVE",
  notificationsEnabled: true,
  businessUsePercent: 50,
});

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function request(payload: object) {
  return new Request("http://localhost:3100/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Subscription RouteとMySQL", () => {
  it("未ログインを拒否する", async () => {
    expect((await POST(request(validPayload()))).status).toBe(401);
  });

  it("Subscriptionと通知設定を同じ所有者で作成する", async () => {
    const owner = await user();
    authState.user = owner;
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const saved = await prisma.subscription.findUnique({
      where: { id },
      include: { notificationSettings: true },
    });
    expect(saved).toMatchObject({ userId: owner.id, price: 980, businessUsePercent: 50 });
    expect(saved?.notificationSettings).toEqual([
      expect.objectContaining({ userId: owner.id, enabled: true }),
    ]);
  });

  it("他ユーザーのカテゴリを指定した登録を拒否する", async () => {
    const owner = await user();
    const other = await user();
    const category = await prisma.category.create({
      data: { userId: other.id, name: uniqueLabel("OtherCategory"), color: "#000000" },
    });
    authState.user = owner;
    const response = await POST(request({ ...validPayload(), categoryId: category.id }));
    expect(response.status).toBe(400);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("Freeプランの10件境界を超えて登録しない", async () => {
    const owner = await user({ plan: "FREE" });
    await prisma.subscription.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        userId: owner.id,
        name: `FreeLimit${index}`,
        price: 100,
        billingCycle: "MONTHLY",
        nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
        status: "ACTIVE",
      })),
    });
    authState.user = owner;
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(403);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(10);
  });

  it("CUSTOM周期の日数不足を項目付きで返す", async () => {
    authState.user = await user();
    const response = await POST(request({ ...validPayload(), billingCycle: "CUSTOM" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: {
        customCycleDays: ["カスタム請求では周期日数を入力してください。"],
      },
    });
  });
});
