import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { japanCalendarDate, shiftCalendarDays } from "@/lib/subscription-usage";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const mailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/mail", () => ({ sendSubscriptionReminderEmail: mailMock }));

import { POST } from "@/app/api/notifications/send/route";

const createdUserIds: string[] = [];

async function user() {
  const created = await createTestUser({ plan: "FREE" });
  createdUserIds.push(created.id);
  return created;
}

async function renewalSubscription(userId: string, enabled = true) {
  const item = await prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("RenewalNotice"),
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: shiftCalendarDays(japanCalendarDate(), 7),
      notifyDaysBefore: 7,
    },
  });
  await prisma.notificationSetting.create({
    data: { userId, subscriptionId: item.id, daysBefore: 7, enabled },
  });
  return item;
}

function request() {
  return new NextRequest("http://127.0.0.1:3100/api/notifications/send", { method: "POST" });
}

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("通知送信と重複防止", () => {
  it("更新期限に一致する通知を送信して配信履歴を保存する", async () => {
    const owner = await user();
    const item = await renewalSubscription(owner.id);
    authState.user = owner;
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, sent: 1, skipped: 0 });
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ email: owner.email, title: "更新日のお知らせ" }));
    expect(await prisma.notificationDelivery.count({ where: { userId: owner.id, subscriptionId: item.id, type: "renewal" } })).toBe(1);
  });

  it("同じ契約・通知種別・期限を二重送信しない", async () => {
    const owner = await user();
    await renewalSubscription(owner.id);
    authState.user = owner;
    expect((await POST(request())).status).toBe(200);
    const second = await POST(request());
    expect(await second.json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(mailMock).toHaveBeenCalledTimes(1);
  });

  it("通知無効の契約と他ユーザーの契約を送信しない", async () => {
    const owner = await user();
    const other = await user();
    await renewalSubscription(owner.id, false);
    await renewalSubscription(other.id, true);
    authState.user = owner;
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ sent: 0, skipped: 0 });
    expect(mailMock).not.toHaveBeenCalled();
    expect(await prisma.notificationDelivery.count()).toBe(0);
  });

  it("メール送信失敗時は配信履歴を作成せず再試行可能にする", async () => {
    const owner = await user();
    const item = await renewalSubscription(owner.id);
    authState.user = owner;
    mailMock.mockRejectedValueOnce(new Error("mail provider unavailable"));
    const failed = await POST(request());
    expect(await failed.json()).toMatchObject({ ok: false, sent: 0, failures: [item.name] });
    expect(await prisma.notificationDelivery.count({ where: { subscriptionId: item.id } })).toBe(0);

    const retried = await POST(request());
    expect(await retried.json()).toMatchObject({ ok: true, sent: 1 });
    expect(await prisma.notificationDelivery.count({ where: { subscriptionId: item.id } })).toBe(1);
  });
});
