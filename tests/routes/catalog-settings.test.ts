import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST as createCategory } from "@/app/api/categories/route";
import { POST as createPaymentMethod } from "@/app/api/payment-methods/route";

const createdUserIds: string[] = [];

function request(path: string, payload: object) {
  return new Request(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("カテゴリ・支払い方法", () => {
  it("カテゴリをログインユーザーの所有データとして保存する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    authState.user = owner;
    const name = uniqueLabel("Category");
    expect((await createCategory(request("/api/categories", { name, color: "#2563eb" }))).status).toBe(200);
    expect(await prisma.category.findFirst({ where: { userId: owner.id, name } })).toMatchObject({ color: "#2563eb" });
  });

  it("Freeプランのカテゴリ6件目を拒否する", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    createdUserIds.push(owner.id);
    await prisma.category.createMany({
      data: Array.from({ length: 5 }, (_, index) => ({ userId: owner.id, name: `Limit${index}`, color: "#2563eb" })),
    });
    authState.user = owner;
    const response = await createCategory(request("/api/categories", { name: uniqueLabel("OverLimit"), color: "#2563eb" }));
    expect(response.status).toBe(403);
    expect(await prisma.category.count({ where: { userId: owner.id } })).toBe(5);
  });

  it("同じユーザーのカテゴリ名重複を日本語の競合応答にする", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    authState.user = owner;
    const name = uniqueLabel("DuplicateCategory");
    expect((await createCategory(request("/api/categories", { name, color: "#2563eb" }))).status).toBe(200);
    const duplicate = await createCategory(request("/api/categories", { name, color: "#16a34a" }));
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ message: "同じ名前のカテゴリが既に登録されています。" });
    expect(await prisma.category.count({ where: { userId: owner.id, name } })).toBe(1);
  });

  it("Stripe対応の支払い方法だけを保存する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    const name = uniqueLabel("CreditCard");
    const valid = await createPaymentMethod(request("/api/payment-methods", { name, type: "CREDIT_CARD", memo: "業務用" }));
    const invalid = await createPaymentMethod(request("/api/payment-methods", { name: uniqueLabel("Cash"), type: "CASH" }));
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(await prisma.paymentMethod.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("カテゴリと支払い方法の空文字・不正色・過長メモを保存しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    expect((await createCategory(request("/api/categories", { name: " ", color: "blue" }))).status).toBe(400);
    expect((await createPaymentMethod(request("/api/payment-methods", {
      name: "カード",
      type: "CREDIT_CARD",
      memo: "a".repeat(192),
    }))).status).toBe(400);
    expect(await prisma.category.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.paymentMethod.count({ where: { userId: owner.id } })).toBe(0);
  });
});
