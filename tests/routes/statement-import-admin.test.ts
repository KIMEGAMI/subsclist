import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const adminState = vi.hoisted(() => ({ allowed: false }));
const mailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
  getAdminApiUser: async () => adminState.allowed
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "管理者のみ実行できます。" }, { status: 403 }) },
}));
vi.mock("@/lib/mail", () => ({ sendAdminBulkEmail: mailMock }));

import { POST as importPayments } from "@/app/api/import/payments/route";
import { DELETE as undoImport } from "@/app/api/import/payments/[id]/route";
import { POST as sendBulkEmail } from "@/app/api/admin/bulk-email/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name: uniqueLabel("StatementSubscription"),
      price: 1480,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
      businessUsePercent: 60,
      defaultAccountingLabel: "通信費",
    },
  });
}

function jsonRequest(path: string, payload: object) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  adminState.allowed = false;
  vi.clearAllMocks();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("明細支払い取込と取り消し", () => {
  it("Premiumの明細をスナップショット付きで保存し一括取り消しする", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await importPayments(jsonRequest("/api/import/payments", {
      items: [{ rowNumber: 2, subscriptionId: item.id, amount: 1480, paidAt: "2026-09-01", merchant: "TEST SERVICE", rememberMerchantAlias: true }],
    }));
    expect(response.status).toBe(200);
    const result = (await response.json()) as { paymentImport: { id: string }; createdCount: number };
    expect(result.createdCount).toBe(1);
    expect(await prisma.paymentHistory.findFirst({ where: { userId: owner.id } })).toMatchObject({
      subscriptionId: item.id,
      businessUsePercent: 60,
      accountingLabel: "通信費",
      subscriptionNameSnapshot: item.name,
    });

    const undo = await undoImport(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: result.paymentImport.id }) });
    expect(undo.status).toBe(200);
    expect(await prisma.paymentHistory.count({ where: { userId: owner.id } })).toBe(0);
    expect((await prisma.statementPaymentImport.findUniqueOrThrow({ where: { id: result.paymentImport.id } })).undoneAt).toBeInstanceOf(Date);
    expect((await undoImport(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: result.paymentImport.id }) })).status).toBe(409);
  });

  it("Freeプランと他ユーザー契約の取込を拒否する", async () => {
    const free = await user({ plan: "FREE" });
    const other = await user({ plan: "PREMIUM" });
    const foreign = await subscription(other.id);
    const payload = { items: [{ rowNumber: 2, subscriptionId: foreign.id, amount: 1480, paidAt: "2026-09-01" }] };
    authState.user = free;
    expect((await importPayments(jsonRequest("/api/import/payments", payload))).status).toBe(403);
    authState.user = await user({ plan: "PREMIUM" });
    expect((await importPayments(jsonRequest("/api/import/payments", payload))).status).toBe(409);
    expect(await prisma.paymentHistory.count({ where: { subscriptionId: foreign.id } })).toBe(0);
  });

  it("選択明細内の重複を拒否し取込履歴を作らない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    authState.user = owner;
    const duplicatedItem = { rowNumber: 2, subscriptionId: item.id, amount: 1480, paidAt: "2026-09-01" };
    const response = await importPayments(jsonRequest("/api/import/payments", {
      items: [duplicatedItem, { ...duplicatedItem, rowNumber: 3 }],
    }));
    expect(response.status).toBe(400);
    expect(await prisma.paymentHistory.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.statementPaymentImport.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("既存支払いとの競合時に取込履歴と名義ルールを残さない", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id);
    await prisma.paymentHistory.create({
      data: {
        userId: owner.id,
        subscriptionId: item.id,
        amount: 1480,
        paidAt: new Date("2026-09-01T00:00:00.000Z"),
        subscriptionNameSnapshot: item.name,
      },
    });
    authState.user = owner;
    const response = await importPayments(jsonRequest("/api/import/payments", {
      items: [{
        rowNumber: 2,
        subscriptionId: item.id,
        amount: 1480,
        paidAt: "2026-09-01",
        merchant: "ROLLBACK TEST MERCHANT",
        rememberMerchantAlias: true,
      }],
    }));
    expect(response.status).toBe(409);
    expect(await prisma.paymentHistory.count({ where: { userId: owner.id } })).toBe(1);
    expect(await prisma.statementPaymentImport.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.statementMerchantAlias.count({ where: { userId: owner.id } })).toBe(0);
  });
});

describe("管理者一斉メール", () => {
  it("一般ユーザーを拒否する", async () => {
    expect((await sendBulkEmail(jsonRequest("/api/admin/bulk-email", { subject: "件名", body: "本文", recipientScope: "VERIFIED" }))).status).toBe(403);
    expect(mailMock).not.toHaveBeenCalled();
  });

  it("PREMIUM指定では認証済みPremiumだけへ送る", async () => {
    const admin = await user({ plan: "PREMIUM" });
    const premium = await user({ plan: "PREMIUM" });
    await user({ plan: "FREE" });
    await user({ plan: "PREMIUM", verified: false });
    authState.user = admin;
    adminState.allowed = true;
    const response = await sendBulkEmail(jsonRequest("/api/admin/bulk-email", {
      subject: "重要なお知らせ",
      body: "テスト本文",
      recipientScope: "PREMIUM",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 2, failed: 0, total: 2 });
    expect(mailMock).toHaveBeenCalledWith(expect.objectContaining({ to: premium.email }));
  });

  it("一部の宛先で送信に失敗しても残りを継続し件数を返す", async () => {
    const admin = await user({ plan: "PREMIUM" });
    await user({ plan: "PREMIUM" });
    await user({ plan: "PREMIUM" });
    authState.user = admin;
    adminState.allowed = true;
    mailMock.mockRejectedValueOnce(new Error("SMTP internal detail"));

    const response = await sendBulkEmail(jsonRequest("/api/admin/bulk-email", {
      subject: "重要なお知らせ",
      body: "テスト本文",
      recipientScope: "PREMIUM",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, sent: 2, failed: 1, total: 3 });
    expect(mailMock).toHaveBeenCalledTimes(3);
  });
});
