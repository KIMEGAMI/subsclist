import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { NOTIFICATION_JOB_STATUS_KEY, parseNotificationJobStatus } from "@/lib/notification-job-status";
import { japanHour } from "@/lib/notification-schedule";
import { japanCalendarDate, shiftCalendarDays } from "@/lib/subscription-usage";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
type ReminderMessage = { email: string; title: string; lines: string[] };
const mailMock = vi.hoisted(() => vi.fn(async (message: ReminderMessage) => {
  void message;
}));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/mail", () => ({ sendSubscriptionReminderEmail: mailMock }));

import { POST } from "@/app/api/notifications/send/route";

const createdUserIds: string[] = [];

async function user(plan: "FREE" | "PREMIUM" = "FREE") {
  const created = await createTestUser({ plan });
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, data: Partial<{
  price: number;
  nextBillingDate: Date;
  trialEndsAt: Date;
  cancellationDeadline: Date;
  scheduledPrice: number;
  scheduledPriceAt: Date;
}>) {
  const item = await prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("AdvancedNotice"),
      price: data.price ?? 980,
      billingCycle: "MONTHLY",
      nextBillingDate: data.nextBillingDate ?? shiftCalendarDays(japanCalendarDate(), 60),
      trialEndsAt: data.trialEndsAt,
      cancellationDeadline: data.cancellationDeadline,
      scheduledPrice: data.scheduledPrice,
      scheduledPriceAt: data.scheduledPriceAt,
      notifyDaysBefore: 7,
      usageFrequency: "DAILY",
      priority: "ESSENTIAL",
      lastReviewedAt: new Date(),
    },
  });
  await prisma.notificationSetting.create({
    data: { userId, subscriptionId: item.id, daysBefore: 7, enabled: true },
  });
  return item;
}

function request(authorization?: string) {
  return new NextRequest("http://127.0.0.1:3100/api/notifications/send", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

afterEach(async () => {
  vi.useRealTimers();
  authState.user = null;
  vi.clearAllMocks();
  await prisma.appSetting.deleteMany({ where: { key: NOTIFICATION_JOB_STATUS_KEY } });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("期限別通知", () => {
  it("無料トライアル・解約期限・価格変更予定をそれぞれ送信する", async () => {
    const owner = await user();
    const dueDate = shiftCalendarDays(japanCalendarDate(), 7);
    const item = await subscription(owner.id, {
      trialEndsAt: dueDate,
      cancellationDeadline: dueDate,
      scheduledPrice: 1280,
      scheduledPriceAt: dueDate,
    });
    authState.user = owner;

    const response = await POST(request());
    expect(await response.json()).toMatchObject({ ok: true, sent: 3, skipped: 0 });
    expect(mailMock.mock.calls.map(([message]) => message.title)).toEqual(expect.arrayContaining([
      "無料トライアル終了のお知らせ",
      "解約期限のお知らせ",
      "価格変更予定のお知らせ",
    ]));
    expect(await prisma.notificationDelivery.findMany({
      where: { subscriptionId: item.id },
      select: { type: true },
    })).toEqual(expect.arrayContaining([
      { type: "trial" },
      { type: "cancellation" },
      { type: "scheduled_price_change" },
    ]));
  });
});

describe("契約全体の通知", () => {
  it("月額予算超過を1日1回だけ通知する", async () => {
    const owner = await user();
    await prisma.userPreference.create({ data: { userId: owner.id, monthlyBudget: 500 } });
    await subscription(owner.id, { price: 980 });
    authState.user = owner;

    expect(await (await POST(request())).json()).toMatchObject({ sent: 1, skipped: 0 });
    expect(await (await POST(request())).json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mailMock).toHaveBeenCalledTimes(1);
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ title: "月額予算の超過" }));
    expect(await prisma.userNotificationDelivery.count({
      where: { userId: owner.id, type: "budget_overrun" },
    })).toBe(1);
  });

  it("Premiumへ月初サマリーを送信し、同月の再送を防ぐ", async () => {
    const owner = await user("PREMIUM");
    await prisma.userPreference.create({
      data: { userId: owner.id, monthlyBudget: 3000, monthlyDigestEnabled: true },
    });
    await subscription(owner.id, { price: 980 });
    authState.user = owner;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T03:00:00.000Z"));

    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ title: "9月のサブスク運用サマリー" }));
    expect(await prisma.userNotificationDelivery.count({
      where: { userId: owner.id, type: "monthly_portfolio_digest" },
    })).toBe(1);

    await POST(request());
    expect(mailMock.mock.calls.filter(([message]) => message.title === "9月のサブスク運用サマリー")).toHaveLength(1);
  });
});

describe("通知ジョブ認証と実行状態", () => {
  it("不正なBearerではジョブを実行せず401を返す", async () => {
    const response = await POST(request("Bearer invalid-notification-secret"));
    expect(response.status).toBe(401);
    expect(await prisma.appSetting.findUnique({ where: { key: NOTIFICATION_JOB_STATUS_KEY } })).toBeNull();
    expect(mailMock).not.toHaveBeenCalled();
  });

  it("正しいBearerで全利用者を処理し成功状態を保存する", async () => {
    const firstUser = await user();
    const secondUser = await user();
    const notificationHour = japanHour();
    await prisma.userPreference.createMany({
      data: [
        { userId: firstUser.id, notificationHour },
        { userId: secondUser.id, notificationHour },
      ],
    });
    const renewalDate = shiftCalendarDays(japanCalendarDate(), 7);
    await subscription(firstUser.id, { nextBillingDate: renewalDate });
    await subscription(secondUser.id, { nextBillingDate: renewalDate });

    const response = await POST(request(`Bearer ${env.notificationJobSecret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, sent: 2, skipped: 0 });
    const record = await prisma.appSetting.findUniqueOrThrow({ where: { key: NOTIFICATION_JOB_STATUS_KEY } });
    expect(parseNotificationJobStatus(record.value)).toMatchObject({
      state: "SUCCEEDED",
      sent: 2,
      failures: 0,
    });
  });

  it("送信失敗を一部失敗状態として保存し再試行可能にする", async () => {
    const owner = await user();
    await prisma.userPreference.create({ data: { userId: owner.id, notificationHour: japanHour() } });
    const item = await subscription(owner.id, {
      nextBillingDate: shiftCalendarDays(japanCalendarDate(), 7),
    });
    mailMock.mockRejectedValueOnce(new Error("mail provider unavailable"));

    const response = await POST(request(`Bearer ${env.notificationJobSecret}`));
    expect(await response.json()).toMatchObject({ ok: false, sent: 0, failures: [item.name] });
    const record = await prisma.appSetting.findUniqueOrThrow({ where: { key: NOTIFICATION_JOB_STATUS_KEY } });
    expect(parseNotificationJobStatus(record.value)).toMatchObject({
      state: "PARTIAL",
      sent: 0,
      failures: 1,
    });
    expect(await prisma.notificationDelivery.count({ where: { subscriptionId: item.id } })).toBe(0);
  });
});
