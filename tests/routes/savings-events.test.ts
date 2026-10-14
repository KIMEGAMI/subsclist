import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: new Response(null, { status: 401 }) },
}));

import { GET as getEvents, POST as createEvent } from "@/app/api/savings-events/route";
import { GET as getSavings } from "@/app/api/savings/route";
import { GET as exportEvents } from "@/app/api/export/savings-events/route";

const userIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...userIds.splice(0));
});

describe("削減実績API", () => {
  it("解約実績を月額換算で保存し、重複作成を防ぎ、本人分だけCSV出力する", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    userIds.push(owner.id, other.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: "削減対象サービス", price: 2_000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const foreignSubscription = await prisma.subscription.create({ data: { userId: other.id, name: "他ユーザーのサービス", price: 9_800, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });

    const request = (body: Record<string, unknown>, idempotencyKey = uniqueLabel("savings-idempotency")) => new Request("http://127.0.0.1:3100/api/savings-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey }) });
    authState.user = owner;
    const idempotencyKey = uniqueLabel("savings-idempotency");
    const createdBody = { subscriptionId: subscription.id, type: "CANCELLED", afterMonthlyAmount: 0, note: "利用停止" };
    const created = await createEvent(request(createdBody, idempotencyKey));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ ok: true, event: { monthlySaving: 2_000, annualSaving: 24_000 } });

    const duplicate = await createEvent(request(createdBody, idempotencyKey));
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ duplicate: true });

    authState.user = other;
    expect((await createEvent(request({ subscriptionId: subscription.id, type: "CANCELLED", afterMonthlyAmount: 0 }))).status).toBe(404);
    authState.user = owner;
    expect((await createEvent(request({ subscriptionId: foreignSubscription.id, type: "CANCELLED", afterMonthlyAmount: 0 }))).status).toBe(404);

    const listed = await getEvents();
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    expect((await listed.json()).events).toEqual([expect.objectContaining({ monthlySaving: 2_000 })]);
    const csv = await exportEvents();
    expect(csv.status).toBe(200);
    expect(csv.headers.get("cache-control")).toBe("private, no-store");
    const csvText = await csv.text();
    expect(csvText).toContain("削減対象サービス");
    expect(csvText).not.toContain("他ユーザーのサービス");
  });

  it("後日同じ内容の削減実績を別の操作として追加できる", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: uniqueLabel("RepeatedSavings"), price: 2_000, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    authState.user = owner;
    const body = { subscriptionId: subscription.id, type: "PLAN_DOWNGRADE", afterMonthlyAmount: 1_000 };
    const first = await createEvent(new Request("http://127.0.0.1:3100/api/savings-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: uniqueLabel("first-savings") }) }));
    const later = await createEvent(new Request("http://127.0.0.1:3100/api/savings-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: uniqueLabel("later-savings") }) }));

    expect(first.status).toBe(201);
    expect(later.status).toBe(201);
    expect(await prisma.savingsEvent.count({ where: { userId: owner.id } })).toBe(2);
  });

  it("不正な金額と未認証の呼び出しを拒否する", async () => {
    const owner = await createTestUser();
    userIds.push(owner.id);
    const subscription = await prisma.subscription.create({ data: { userId: owner.id, name: uniqueLabel("削減入力"), price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const request = new Request("http://127.0.0.1:3100/api/savings-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: subscription.id, type: "PLAN_DOWNGRADE", afterMonthlyAmount: 980 }) });
    expect((await createEvent(request)).status).toBe(401);
    authState.user = owner;
    expect((await createEvent(request)).status).toBe(400);
  });

  it("Freeの節約実績CSVを拒否し、Premiumは本人分を取得する", async () => {
    const free = await createTestUser({ plan: "FREE" });
    const premium = await createTestUser({ plan: "PREMIUM" });
    userIds.push(free.id, premium.id);

    authState.user = free;
    expect((await exportEvents()).status).toBe(403);

    authState.user = premium;
    expect((await exportEvents()).status).toBe(200);
  });

  it("Freeの節約実績の記録・一覧・集計APIを拒否し、Premiumの利用を維持する", async () => {
    const free = await createTestUser({ plan: "FREE" });
    const premium = await createTestUser({ plan: "PREMIUM" });
    userIds.push(free.id, premium.id);
    const subscription = await prisma.subscription.create({ data: { userId: free.id, name: uniqueLabel("FreeSavings"), price: 1_200, billingCycle: "MONTHLY", nextBillingDate: new Date("2031-01-01T00:00:00.000Z") } });
    const postRequest = new Request("http://127.0.0.1:3100/api/savings-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscriptionId: subscription.id, type: "CANCELLED", afterMonthlyAmount: 0 }) });

    authState.user = free;
    expect((await createEvent(postRequest)).status).toBe(403);
    expect((await getEvents()).status).toBe(403);
    expect((await getSavings()).status).toBe(403);
    expect(await prisma.savingsEvent.count({ where: { userId: free.id } })).toBe(0);

    authState.user = premium;
    expect((await getEvents()).status).toBe(200);
    expect((await getSavings()).status).toBe(200);
  });

  it("集計値は最新100件を超える全実績を含める", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    userIds.push(owner.id);
    const subscription = await prisma.subscription.create({
      data: {
        userId: owner.id,
        name: uniqueLabel("SavingsAggregate"),
        price: 1_000,
        billingCycle: "MONTHLY",
        nextBillingDate: new Date("2031-01-01T00:00:00.000Z"),
      },
    });
    const now = new Date();
    await prisma.savingsEvent.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        userId: owner.id,
        subscriptionId: subscription.id,
        type: "CANCELLED",
        beforeMonthlyAmount: 10,
        afterMonthlyAmount: 0,
        monthlySaving: 10,
        annualSaving: 120,
        confirmedAt: now,
        dedupeKey: `aggregate:${owner.id}:${index}`,
      })),
    });
    authState.user = owner;

    const response = await getSavings();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.summary).toEqual({ monthSaving: 1_050, yearSaving: 1_050, lifetimeSaving: 1_050 });
    expect(result.monthly.at(-1)?.saving).toBe(1_050);
    expect(result.events).toHaveLength(100);
  });
});
