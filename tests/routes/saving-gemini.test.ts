import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_DAILY_REQUEST_LIMIT } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const geminiMock = vi.hoisted(() => vi.fn(async (args: unknown) => {
  void args;
  return { summary: "分析結果", recommendations: [] };
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/gemini-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gemini-analysis")>();
  return { ...actual, generateGeminiAnalysis: geminiMock };
});

import { POST as analyzeWithGemini } from "@/app/api/gemini/analysis/route";
import { PUT as saveDecision } from "@/app/api/saving-challenges/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, name = uniqueLabel("DecisionSubscription"), status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  return prisma.subscription.create({
    data: {
      userId,
      name,
      price: 1200,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
      status,
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
  geminiMock.mockReset();
  geminiMock.mockResolvedValue({ summary: "分析結果", recommendations: [] });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("更新判断の記録", () => {
  it("Premium本人の当月判断をupsertして見直し日時を更新する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    expect((await saveDecision(jsonRequest("/api/saving-challenges", { subscriptionId: item.id, status: "HOLD", reason: "利用状況を確認" }, "PUT"))).status).toBe(200);
    expect((await saveDecision(jsonRequest("/api/saving-challenges", { subscriptionId: item.id, status: "CANCEL_PLANNED", reason: "利用頻度が低い" }, "PUT"))).status).toBe(200);
    expect(await prisma.savingChallenge.count({ where: { userId: owner.id, subscriptionId: item.id } })).toBe(1);
    expect(await prisma.savingChallenge.findFirstOrThrow({ where: { userId: owner.id, subscriptionId: item.id } })).toMatchObject({ status: "CANCEL_PLANNED", reason: "利用頻度が低い", potentialMonthlySaving: 1200 });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).lastReviewedAt).toBeInstanceOf(Date);
  });

  it("Free・不正入力・他ユーザー・解約済み契約を拒否する", async () => {
    const free = await user({ plan: "FREE" });
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const owned = await subscription(owner.id);
    const cancelled = await subscription(owner.id, uniqueLabel("Cancelled"), "CANCELLED");
    authState.user = free;
    expect((await saveDecision(jsonRequest("/saving", { subscriptionId: owned.id, status: "HOLD" }, "PUT"))).status).toBe(403);
    authState.user = owner;
    expect((await saveDecision(jsonRequest("/saving", { subscriptionId: owned.id, status: "INVALID" }, "PUT"))).status).toBe(400);
    expect((await saveDecision(jsonRequest("/saving", { subscriptionId: cancelled.id, status: "HOLD" }, "PUT"))).status).toBe(404);
    authState.user = other;
    expect((await saveDecision(jsonRequest("/saving", { subscriptionId: owned.id, status: "HOLD" }, "PUT"))).status).toBe(404);
    expect(await prisma.savingChallenge.count({ where: { subscriptionId: owned.id } })).toBe(0);
  });
});

describe("Gemini比較分析", () => {
  it("同意済みPremium本人の有効契約だけを外部分析へ渡す", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const ownedName = uniqueLabel("OWNED_GEMINI");
    const foreignName = uniqueLabel("FOREIGN_GEMINI_SECRET");
    const owned = await subscription(owner.id, ownedName);
    await subscription(owner.id, uniqueLabel("CANCELLED_GEMINI"), "CANCELLED");
    await subscription(other.id, foreignName);
    authState.user = owner;
    const response = await analyzeWithGemini(jsonRequest("/api/gemini/analysis", { consent: true }));
    expect(response.status).toBe(200);
    expect(geminiMock).toHaveBeenCalledOnce();
    const args = geminiMock.mock.calls[0][0] as { subscriptions: Array<{ id: string; name: string }> };
    expect(args.subscriptions).toEqual([expect.objectContaining({ id: owned.id, name: ownedName })]);
    expect(JSON.stringify(args)).not.toContain(foreignName);
    expect(await prisma.geminiAnalysisRequest.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("未同意・Free・分析対象なしを拒否する", async () => {
    authState.user = await user({ plan: "FREE" });
    expect((await analyzeWithGemini(jsonRequest("/gemini", { consent: true }))).status).toBe(403);
    authState.user = await user({ plan: "PREMIUM" });
    expect((await analyzeWithGemini(jsonRequest("/gemini", { consent: false }))).status).toBe(400);
    expect((await analyzeWithGemini(jsonRequest("/gemini", { consent: true }))).status).toBe(400);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("日次上限を超えた要求を外部送信前に拒否する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await subscription(owner.id);
    await prisma.geminiAnalysisRequest.createMany({
      data: Array.from({ length: GEMINI_DAILY_REQUEST_LIMIT }, (_, index) => ({
        userId: owner.id,
        createdAt: new Date(Date.now() - index * 1000),
      })),
    });
    authState.user = owner;
    const response = await analyzeWithGemini(jsonRequest("/gemini", { consent: true }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("外部分析失敗時に内部エラーを露出しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await subscription(owner.id);
    authState.user = owner;
    geminiMock.mockRejectedValueOnce(new Error("secret upstream payload"));
    const response = await analyzeWithGemini(jsonRequest("/gemini", { consent: true }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("secret upstream payload");
  });
});
