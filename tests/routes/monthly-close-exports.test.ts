import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { monthlyClosePeriod } from "@/lib/monthly-close";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { GET as exportAccountData } from "@/app/api/export/account-data/route";
import { GET as exportCalendar } from "@/app/api/export/calendar/route";
import { GET as exportMonthlyPayments } from "@/app/api/export/monthly-payments/route";
import { GET as exportPayments } from "@/app/api/export/payments/route";
import { PUT as closeMonth } from "@/app/api/monthly-close/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, name = uniqueLabel("ExportSubscription")) {
  return prisma.subscription.create({
    data: {
      userId,
      name,
      price: 980,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date(),
      status: "ACTIVE",
    },
  });
}

async function payment(userId: string, subscriptionId: string, subscriptionNameSnapshot: string, paidAt: Date) {
  return prisma.paymentHistory.create({
    data: { userId, subscriptionId, subscriptionNameSnapshot, amount: 980, paidAt },
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("月次締め", () => {
  it("Premiumの当月データだけで締めを作成し、再実行時は同じ月を更新する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const ownedSubscription = await subscription(owner.id);
    const foreignSubscription = await subscription(other.id);
    const period = monthlyClosePeriod();
    await payment(owner.id, ownedSubscription.id, ownedSubscription.name, period.start);
    await payment(owner.id, ownedSubscription.id, ownedSubscription.name, period.end);
    await payment(other.id, foreignSubscription.id, foreignSubscription.name, period.start);
    authState.user = owner;

    expect((await closeMonth()).status).toBe(200);
    expect((await closeMonth()).status).toBe(200);
    expect(await prisma.monthlyClose.count({ where: { userId: owner.id } })).toBe(1);
    expect((await prisma.monthlyClose.findFirstOrThrow({ where: { userId: owner.id } })).paidAmount).toBe(980);
    expect(await prisma.monthlyClose.count({ where: { userId: other.id } })).toBe(0);
  });

  it("Freeプランを拒否する", async () => {
    authState.user = await user({ plan: "FREE" });
    expect((await closeMonth()).status).toBe(403);
  });
});

describe("アカウントデータ出力", () => {
  it("本人データだけを出力し、認証・決済の機密項目を含めない", async () => {
    const owner = await user({ plan: "PREMIUM", name: uniqueLabel("ExportOwner") });
    const other = await user({ plan: "PREMIUM" });
    const ownedMarker = uniqueLabel("OWNED_ACCOUNT_EXPORT");
    const foreignMarker = uniqueLabel("FOREIGN_ACCOUNT_EXPORT");
    await subscription(owner.id, ownedMarker);
    await subscription(other.id, foreignMarker);
    const stripeCustomerSecret = uniqueLabel("cus_sensitive_export");
    const stripeSubscriptionSecret = uniqueLabel("sub_sensitive_export");
    const verificationSecret = uniqueLabel("verification_sensitive_export");
    const resetSecret = uniqueLabel("reset_sensitive_export");
    const deviceSecret = "f".repeat(64);
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: stripeCustomerSecret, stripeSubscriptionId: stripeSubscriptionSecret },
    });
    await Promise.all([
      prisma.emailVerificationToken.create({ data: { userId: owner.id, tokenHash: verificationSecret, expiresAt: new Date("2099-01-01T00:00:00.000Z") } }),
      prisma.passwordResetToken.create({ data: { userId: owner.id, tokenHash: resetSecret, expiresAt: new Date("2099-01-01T00:00:00.000Z") } }),
      prisma.trustedLoginDevice.create({ data: { userId: owner.id, tokenHash: deviceSecret, clientLabel: "出力対象外端末" } }),
    ]);
    authState.user = owner;

    const response = await exportAccountData();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toContain(ownedMarker);
    expect(body).not.toContain(foreignMarker);
    for (const sensitiveKey of ["passwordHash", "sessionVersion", "stripeCustomerId", "stripeSubscriptionId", "tokenHash"]) {
      expect(body).not.toContain(`\"${sensitiveKey}\"`);
    }
    for (const sensitiveValue of [stripeCustomerSecret, stripeSubscriptionSecret, verificationSecret, resetSecret, deviceSecret]) {
      expect(body).not.toContain(sensitiveValue);
    }
  });
});

describe("支払いCSV出力", () => {
  it("年次CSVは本人の対象年だけを出力し、数式先頭を無害化する", async () => {
    const year = new Date().getUTCFullYear();
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const owned = await subscription(owner.id);
    const foreign = await subscription(other.id);
    await payment(owner.id, owned.id, "=1+1", new Date(Date.UTC(year, 0, 15)));
    await payment(other.id, foreign.id, "FOREIGN_CSV_MARKER", new Date(Date.UTC(year, 0, 15)));
    authState.user = owner;

    const response = await exportPayments(new Request(`http://127.0.0.1:3100/api/export/payments?year=${year}`));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const csv = new TextDecoder().decode(bytes);
    expect(response.status).toBe(200);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain("\"'=1+1\"");
    expect(csv).not.toContain("FOREIGN_CSV_MARKER");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("月次CSVは指定月だけを出力し、未来月とFreeプランを拒否する", async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    await payment(owner.id, item.id, "CURRENT_MONTH_MARKER", new Date(Date.UTC(year, month - 1, 10)));
    await payment(owner.id, item.id, "OTHER_MONTH_MARKER", new Date(Date.UTC(year, month - 2, 10)));
    authState.user = owner;

    const response = await exportMonthlyPayments(new Request(`http://127.0.0.1:3100/api/export/monthly-payments?year=${year}&month=${month}`));
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(csv).toContain("CURRENT_MONTH_MARKER");
    expect(csv).not.toContain("OTHER_MONTH_MARKER");

    const future = new Date(Date.UTC(year, month + 1, 1));
    expect((await exportMonthlyPayments(new Request(`http://127.0.0.1:3100/api/export/monthly-payments?year=${future.getUTCFullYear()}&month=${future.getUTCMonth() + 1}`))).status).toBe(400);
    authState.user = await user({ plan: "FREE" });
    expect((await exportMonthlyPayments(new Request(`http://127.0.0.1:3100/api/export/monthly-payments?year=${year}&month=${month}`))).status).toBe(403);
  });
});

describe("カレンダー出力", () => {
  it("Premium本人の契約だけを出力し、Freeを拒否する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const ownedMarker = uniqueLabel("OWNED_CALENDAR");
    const foreignMarker = uniqueLabel("FOREIGN_CALENDAR");
    await subscription(owner.id, ownedMarker);
    await subscription(other.id, foreignMarker);
    authState.user = owner;

    const response = await exportCalendar();
    const calendar = await response.text();
    expect(response.status).toBe(200);
    expect(calendar).toContain(ownedMarker);
    expect(calendar).not.toContain(foreignMarker);
    expect(response.headers.get("content-type")).toContain("text/calendar");

    authState.user = await user({ plan: "FREE" });
    expect((await exportCalendar()).status).toBe(403);
  });
});
