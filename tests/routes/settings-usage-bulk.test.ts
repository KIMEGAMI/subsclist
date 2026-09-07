import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { japanCalendarDate } from "@/lib/subscription-usage";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const cookieMock = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieMock }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/auth", () => ({ clearSession: vi.fn(async () => undefined) }));

import { PUT as updateProfile } from "@/app/api/settings/profile/route";
import { PUT as updatePlan } from "@/app/api/settings/plan/route";
import { POST as revokeSessions } from "@/app/api/settings/security/sessions/route";
import { POST as bulkUpdate } from "@/app/api/subscriptions/bulk/route";
import { DELETE as deleteTodayUsage, PUT as putTodayUsage } from "@/app/api/subscriptions/[id]/usage/today/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, name: string) {
  return prisma.subscription.create({
    data: { userId, name, price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2026-10-01T00:00:00.000Z") },
  });
}

function jsonRequest(path: string, payload: object) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function responseStatus(response: Response | undefined) {
  if (!response) throw new Error("API応答がありません。");
  return response.status;
}

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("設定の所有者境界", () => {
  it("プロフィールはログイン中のユーザーだけを更新する", async () => {
    const owner = await user();
    const other = await user();
    authState.user = owner;
    const response = await updateProfile(jsonRequest("/api/settings/profile", { name: " 更新後の名前 " }));
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).name).toBe("更新後の名前");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).name).toBe(other.name);
  });

  it("ローカルAPIだけでPremiumへ変更できない", async () => {
    expect((await updatePlan()).status).toBe(405);
  });

  it("全セッション失効でversionを更新し信頼済み端末を削除する", async () => {
    const owner = await user();
    authState.user = owner;
    await prisma.trustedLoginDevice.create({
      data: { userId: owner.id, tokenHash: uniqueLabel("DeviceHash").slice(0, 64).padEnd(64, "0"), clientLabel: "テスト端末" },
    });
    const response = await revokeSessions();
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).sessionVersion).toBe(owner.sessionVersion + 1);
    expect(await prisma.trustedLoginDevice.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.loginSecurityEvent.count({ where: { userId: owner.id, type: "ALL_SESSIONS_REVOKED" } })).toBe(1);
  });
});

describe("利用記録と一括更新のIDOR", () => {
  it("当日の利用記録を冪等に作成して削除する", async () => {
    const owner = await user();
    const item = await subscription(owner.id, uniqueLabel("Usage"));
    authState.user = owner;
    const context = { params: Promise.resolve({ id: item.id }) };
    expect(responseStatus(await putTodayUsage(new Request("http://127.0.0.1:3100"), context))).toBe(200);
    expect(responseStatus(await putTodayUsage(new Request("http://127.0.0.1:3100"), context))).toBe(200);
    expect(await prisma.subscriptionUsage.count({ where: { userId: owner.id, subscriptionId: item.id, usedDate: japanCalendarDate() } })).toBe(1);
    expect(responseStatus(await deleteTodayUsage(new Request("http://127.0.0.1:3100"), context))).toBe(200);
    expect(await prisma.subscriptionUsage.count({ where: { subscriptionId: item.id } })).toBe(0);
  });

  it("他ユーザーの契約には利用記録を作らない", async () => {
    const owner = await user();
    const attacker = await user();
    const item = await subscription(owner.id, uniqueLabel("ForeignUsage"));
    authState.user = attacker;
    const response = await putTodayUsage(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: item.id }) });
    expect(responseStatus(response)).toBe(404);
    expect(await prisma.subscriptionUsage.count({ where: { subscriptionId: item.id } })).toBe(0);
  });

  it("所有する複数契約を一括更新する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const first = await subscription(owner.id, uniqueLabel("BulkFirst"));
    const second = await subscription(owner.id, uniqueLabel("BulkSecond"));
    authState.user = owner;
    const response = await bulkUpdate(jsonRequest("/api/subscriptions/bulk", {
      subscriptionIds: [first.id, second.id],
      priority: "OPTIONAL",
    }));
    expect(response.status).toBe(200);
    expect(await prisma.subscription.count({ where: { id: { in: [first.id, second.id] }, priority: "OPTIONAL" } })).toBe(2);
  });

  it("他ユーザーIDが混ざる一括更新を全件拒否する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const owned = await subscription(owner.id, uniqueLabel("OwnedBulk"));
    const foreign = await subscription(other.id, uniqueLabel("ForeignBulk"));
    authState.user = owner;
    const response = await bulkUpdate(jsonRequest("/api/subscriptions/bulk", {
      subscriptionIds: [owned.id, foreign.id],
      priority: "OPTIONAL",
    }));
    expect(response.status).toBe(403);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: owned.id } })).priority).toBe("UNKNOWN");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: foreign.id } })).priority).toBe("UNKNOWN");
  });

  it("重複した契約IDと他ユーザーの関連IDを拒否して全件を維持する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const first = await subscription(owner.id, uniqueLabel("BulkValidationFirst"));
    const second = await subscription(owner.id, uniqueLabel("BulkValidationSecond"));
    const foreignCategory = await prisma.category.create({
      data: { userId: other.id, name: uniqueLabel("ForeignCategory"), color: "#2563eb" },
    });
    authState.user = owner;

    expect((await bulkUpdate(jsonRequest("/api/subscriptions/bulk", {
      subscriptionIds: [first.id, first.id],
      priority: "OPTIONAL",
    }))).status).toBe(400);
    expect((await bulkUpdate(jsonRequest("/api/subscriptions/bulk", {
      subscriptionIds: [first.id, second.id],
      categoryId: foreignCategory.id,
    }))).status).toBe(400);
    expect(await prisma.subscription.count({
      where: { id: { in: [first.id, second.id] }, priority: "UNKNOWN", categoryId: null },
    })).toBe(2);
  });
});
