import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTACT_RATE_LIMIT_MAX_REQUESTS } from "@/lib/app-constants";
import { env } from "@/lib/env";
import { resetContactRateLimitForTests } from "@/lib/contact-guard";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const contactMailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/mail", () => ({ sendContactEmail: contactMailMock }));

import { POST as submitContact } from "@/app/api/contact/route";
import { POST as organizePayments } from "@/app/api/payment-histories/bulk/route";
import { DELETE as deletePayment, PATCH as updatePayment } from "@/app/api/payment-histories/[id]/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function payment(userId: string, amount = 980, paidAt = new Date("2026-08-01T00:00:00.000Z")) {
  const subscriptionName = uniqueLabel("PaymentMaintenance");
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      name: subscriptionName,
      price: amount,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
  return prisma.paymentHistory.create({
    data: { userId, subscriptionId: subscription.id, subscriptionNameSnapshot: subscriptionName, amount, paidAt },
  });
}

function jsonRequest(path: string, payload: object, origin = env.appUrl) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  contactMailMock.mockReset();
  contactMailMock.mockResolvedValue(undefined);
  resetContactRateLimitForTests();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("問い合わせ", () => {
  const validPayload = { name: "問い合わせ太郎", email: "contact@example.invalid", message: "契約内容について確認したいです。" };

  it("正しい送信元からの問い合わせだけをメール送信する", async () => {
    expect((await submitContact(jsonRequest("/api/contact", validPayload))).status).toBe(200);
    expect(contactMailMock).toHaveBeenCalledWith(validPayload);

    const invalidOrigin = await submitContact(jsonRequest("/api/contact", validPayload, "https://attacker.invalid"));
    expect(invalidOrigin.status).toBe(403);
    expect(contactMailMock).toHaveBeenCalledTimes(1);
  });

  it("NGワードと不正入力を拒否し、ハニーポットはメールを送らず成功扱いにする", async () => {
    expect((await submitContact(jsonRequest("/api/contact", { ...validPayload, message: "Casino Bonusを案内します" }))).status).toBe(400);
    expect((await submitContact(jsonRequest("/api/contact", { ...validPayload, email: "invalid" }))).status).toBe(400);
    expect((await submitContact(jsonRequest("/api/contact", { ...validPayload, website: "https://spam.invalid" }))).status).toBe(200);
    expect(contactMailMock).not.toHaveBeenCalled();
  });

  it("メール送信失敗時に内部情報を露出しない", async () => {
    contactMailMock.mockRejectedValueOnce(new Error("SMTP secret detail"));
    const response = await submitContact(jsonRequest("/api/contact", validPayload));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("SMTP secret detail");
  });

  it("同一送信元の並行問い合わせを上限件数までに制限する", async () => {
    const responses = await Promise.all(
      Array.from({ length: CONTACT_RATE_LIMIT_MAX_REQUESTS + 1 }, (_, index) =>
        submitContact(jsonRequest("/api/contact", {
          ...validPayload,
          message: `並行送信テスト ${index + 1}`,
        }))),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(CONTACT_RATE_LIMIT_MAX_REQUESTS);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(contactMailMock).toHaveBeenCalledTimes(CONTACT_RATE_LIMIT_MAX_REQUESTS);
  });
});

describe("支払い履歴の更新と削除", () => {
  it("所有する履歴を更新・削除できる", async () => {
    const owner = await user();
    const history = await payment(owner.id);
    authState.user = owner;
    const update = await updatePayment(jsonRequest(`/api/payment-histories/${history.id}`, {
      amount: 1280,
      paidAt: "2026-08-02",
      accountingLabel: "通信費",
      referenceUrl: "https://billing.example.invalid/receipt",
    }), { params: Promise.resolve({ id: history.id }) });
    expect(update.status).toBe(200);
    expect(await prisma.paymentHistory.findUniqueOrThrow({ where: { id: history.id } })).toMatchObject({ amount: 1280, accountingLabel: "通信費" });

    expect((await deletePayment(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: history.id }) })).status).toBe(200);
    expect(await prisma.paymentHistory.findUnique({ where: { id: history.id } })).toBeNull();
  });

  it("他ユーザーの履歴を更新・削除できない", async () => {
    const owner = await user();
    const other = await user();
    const foreign = await payment(other.id);
    authState.user = owner;
    const payload = { amount: 1, paidAt: "2026-08-02" };
    expect((await updatePayment(jsonRequest(`/api/payment-histories/${foreign.id}`, payload), { params: Promise.resolve({ id: foreign.id }) })).status).toBe(404);
    expect((await deletePayment(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: foreign.id }) })).status).toBe(404);
    expect((await prisma.paymentHistory.findUniqueOrThrow({ where: { id: foreign.id } })).amount).toBe(980);
  });
});

describe("支払い履歴の一括整理", () => {
  it("Premiumは未整理の所有履歴を一括更新できる", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const first = await payment(owner.id);
    const second = await payment(owner.id, 1480, new Date("2026-09-01T00:00:00.000Z"));
    authState.user = owner;
    const response = await organizePayments(jsonRequest("/api/payment-histories/bulk", {
      paymentHistoryIds: [first.id, second.id],
      accountingLabel: "ソフトウェア費",
    }));
    expect(response.status).toBe(200);
    expect(await prisma.paymentHistory.count({ where: { id: { in: [first.id, second.id] }, accountingLabel: "ソフトウェア費" } })).toBe(2);
  });

  it("Freeを拒否し、他ユーザー履歴が混ざる要求は全件ロールバックする", async () => {
    const free = await user({ plan: "FREE" });
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const owned = await payment(owner.id);
    const foreign = await payment(other.id);
    authState.user = free;
    expect((await organizePayments(jsonRequest("/api/payment-histories/bulk", { paymentHistoryIds: [owned.id], accountingLabel: "通信費" }))).status).toBe(403);

    authState.user = owner;
    expect((await organizePayments(jsonRequest("/api/payment-histories/bulk", { paymentHistoryIds: [owned.id, foreign.id], accountingLabel: "通信費" }))).status).toBe(409);
    expect((await prisma.paymentHistory.findUniqueOrThrow({ where: { id: owned.id } })).accountingLabel).toBeNull();
    expect((await prisma.paymentHistory.findUniqueOrThrow({ where: { id: foreign.id } })).accountingLabel).toBeNull();
  });

  it("重複IDと既に整理済みの履歴を拒否し、未整理の履歴も更新しない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const untouched = await payment(owner.id);
    const organized = await payment(owner.id, 1480, new Date("2026-09-01T00:00:00.000Z"));
    await prisma.paymentHistory.update({ where: { id: organized.id }, data: { accountingLabel: "既存科目" } });
    authState.user = owner;

    expect((await organizePayments(jsonRequest("/api/payment-histories/bulk", {
      paymentHistoryIds: [untouched.id, untouched.id],
      accountingLabel: "通信費",
    }))).status).toBe(400);
    expect((await organizePayments(jsonRequest("/api/payment-histories/bulk", {
      paymentHistoryIds: [untouched.id, organized.id],
      accountingLabel: "通信費",
    }))).status).toBe(409);
    expect((await prisma.paymentHistory.findUniqueOrThrow({ where: { id: untouched.id } })).accountingLabel).toBeNull();
    expect((await prisma.paymentHistory.findUniqueOrThrow({ where: { id: organized.id } })).accountingLabel).toBe("既存科目");
  });
});
