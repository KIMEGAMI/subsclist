import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { startOfJapanWeek } from "@/lib/subscription-weekly-review";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const emailChangeMailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/mail", () => ({ sendEmailChangeVerificationEmail: emailChangeMailMock }));

import { PUT as updateBudget } from "@/app/api/settings/budget/route";
import { POST as requestEmailChange } from "@/app/api/settings/email/route";
import { POST as snoozeNotifications } from "@/app/api/subscriptions/[id]/notifications/snooze/route";
import { PUT as updateWeeklyUsage } from "@/app/api/subscriptions/[id]/usage/weekly/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  return prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("PreferenceSubscription"),
      price: 980,
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
  emailChangeMailMock.mockReset();
  emailChangeMailMock.mockResolvedValue(undefined);
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("予算・通知設定", () => {
  it("本人の設定だけを作成・更新する", async () => {
    const owner = await user();
    const other = await user();
    await prisma.userPreference.create({ data: { userId: other.id, monthlyBudget: 9999 } });
    authState.user = owner;
    const response = await updateBudget(jsonRequest("/api/settings/budget", {
      monthlyBudget: 12000,
      defaultNotifyDaysBefore: 7,
      notificationHour: 9,
      monthlyDigestEnabled: true,
    }, "PUT"));
    expect(response.status).toBe(200);
    expect(await prisma.userPreference.findUniqueOrThrow({ where: { userId: owner.id } })).toMatchObject({ monthlyBudget: 12000, defaultNotifyDaysBefore: 7, notificationHour: 9, monthlyDigestEnabled: true });
    expect((await prisma.userPreference.findUniqueOrThrow({ where: { userId: other.id } })).monthlyBudget).toBe(9999);
  });

  it("範囲外の設定を拒否する", async () => {
    authState.user = await user();
    expect((await updateBudget(jsonRequest("/api/settings/budget", {
      monthlyBudget: -1,
      defaultNotifyDaysBefore: 7,
      notificationHour: 99,
      monthlyDigestEnabled: true,
    }, "PUT"))).status).toBe(400);
    expect(await prisma.userPreference.findUnique({ where: { userId: authState.user.id } })).toBeNull();
  });
});

describe("メールアドレス変更申請", () => {
  it("未使用の旧トークンを無効化し、新しい宛先へ確認メールを送る", async () => {
    const owner = await user();
    authState.user = owner;
    await prisma.emailChangeToken.create({ data: { userId: owner.id, newEmail: "old@example.invalid", tokenHash: uniqueLabel("old-token"), expiresAt: new Date("2099-01-01T00:00:00.000Z") } });
    const newEmail = `${uniqueLabel("changed")}@invalid.example`.toLowerCase();
    const response = await requestEmailChange(jsonRequest("/api/settings/email", { email: newEmail }));
    expect(response.status).toBe(200);
    expect(emailChangeMailMock).toHaveBeenCalledWith(newEmail, expect.any(String));
    expect(await prisma.emailChangeToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(1);
    expect((await prisma.emailChangeToken.findFirstOrThrow({ where: { userId: owner.id, usedAt: null } })).newEmail).toBe(newEmail);
  });

  it("登録済み・保護対象・現在と同じメールアドレスを拒否する", async () => {
    const owner = await user();
    const existing = await user();
    authState.user = owner;
    expect((await requestEmailChange(jsonRequest("/api/settings/email", { email: owner.email }))).status).toBe(400);
    expect((await requestEmailChange(jsonRequest("/api/settings/email", { email: existing.email }))).status).toBe(409);
    expect((await requestEmailChange(jsonRequest("/api/settings/email", { email: env.adminUserEmail }))).status).toBe(403);
    expect(emailChangeMailMock).not.toHaveBeenCalled();
  });

  it("メール送信失敗時は生成したトークンを利用可能な状態で残さない", async () => {
    const owner = await user();
    authState.user = owner;
    emailChangeMailMock.mockRejectedValueOnce(new Error("SMTP internal detail"));
    const response = await requestEmailChange(jsonRequest("/api/settings/email", { email: `${uniqueLabel("failed")}@invalid.example` }));
    expect(response.status).toBe(500);
    expect(await prisma.emailChangeToken.count({ where: { userId: owner.id, usedAt: null } })).toBe(0);
    expect(JSON.stringify(await response.json())).not.toContain("SMTP internal detail");
  });
});

describe("契約通知の一時停止", () => {
  it("本人の通知を一時停止して再開する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    expect((await snoozeNotifications(jsonRequest("/snooze", { duration: "SEVEN_DAYS" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).notificationSnoozedUntil).toBeInstanceOf(Date);
    expect((await snoozeNotifications(jsonRequest("/snooze", { duration: "CLEAR" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).notificationSnoozedUntil).toBeNull();
  });

  it("不正な期間と他ユーザー契約を拒否する", async () => {
    const owner = await user();
    const other = await user();
    const item = await subscription(owner.id);
    authState.user = other;
    expect((await snoozeNotifications(jsonRequest("/snooze", { duration: "SEVEN_DAYS" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(404);
    authState.user = owner;
    expect((await snoozeNotifications(jsonRequest("/snooze", { duration: "FOREVER" }), { params: Promise.resolve({ id: item.id }) })).status).toBe(400);
  });
});

describe("週次利用記録", () => {
  it("本人の今週回答をupsertし、見直し日時を更新する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    expect((await updateWeeklyUsage(jsonRequest("/usage/weekly", { usageRange: "ONE_TWO" }, "PUT"), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await updateWeeklyUsage(jsonRequest("/usage/weekly", { usageRange: "THREE_FIVE" }, "PUT"), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect(await prisma.weeklyUsageReview.count({ where: { userId: owner.id, subscriptionId: item.id } })).toBe(1);
    expect((await prisma.weeklyUsageReview.findFirstOrThrow({ where: { userId: owner.id, subscriptionId: item.id } })).usageRange).toBe("THREE_FIVE");
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: item.id } })).lastReviewedAt).toBeInstanceOf(Date);
  });

  it("日別記録済みの週と他ユーザー・解約済み契約を拒否する", async () => {
    const owner = await user();
    const other = await user();
    const active = await subscription(owner.id);
    const canceled = await subscription(owner.id, "CANCELLED");
    await prisma.subscriptionUsage.create({ data: { userId: owner.id, subscriptionId: active.id, usedDate: startOfJapanWeek(), usageCount: 1 } });
    authState.user = owner;
    expect((await updateWeeklyUsage(jsonRequest("/usage/weekly", { usageRange: "ZERO" }, "PUT"), { params: Promise.resolve({ id: active.id }) })).status).toBe(409);
    expect((await updateWeeklyUsage(jsonRequest("/usage/weekly", { usageRange: "ZERO" }, "PUT"), { params: Promise.resolve({ id: canceled.id }) })).status).toBe(404);
    authState.user = other;
    expect((await updateWeeklyUsage(jsonRequest("/usage/weekly", { usageRange: "ZERO" }, "PUT"), { params: Promise.resolve({ id: active.id }) })).status).toBe(404);
  });
});
