import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const clearSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const stripeMocks = vi.hoisted(() => ({ list: vi.fn(), retrieve: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/auth", () => ({ clearSession: clearSessionMock }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ subscriptions: stripeMocks }) }));

import { DELETE as deleteAccount } from "@/app/api/settings/account/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function request(target: TestUser, overrides?: Partial<{ currentPassword: string; confirmText: string; email: string }>) {
  return new Request("http://127.0.0.1:3100/api/settings/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      currentPassword: target.password,
      confirmText: "削除する",
      email: target.email,
      ...overrides,
    }),
  });
}

afterEach(async () => {
  authState.user = null;
  clearSessionMock.mockClear();
  stripeMocks.list.mockReset();
  stripeMocks.retrieve.mockReset();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("アカウント削除の保護", () => {
  it.each([
    ["デモ", env.demoUserEmail],
    ["管理者", env.adminUserEmail],
  ])("%sアカウントを削除しない", async (_label, email) => {
    const protectedUser = await user({ email, verified: true });
    authState.user = protectedUser;
    const response = await deleteAccount(request(protectedUser));
    expect(response.status).toBe(403);
    expect(await prisma.user.count({ where: { id: protectedUser.id } })).toBe(1);
    expect(stripeMocks.list).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it("継続課金可能なStripe契約がある場合は削除しない", async () => {
    const owner = await user();
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_integration_active" } });
    authState.user = owner;
    stripeMocks.list.mockResolvedValue({ data: [{ status: "active" }] });
    const response = await deleteAccount(request(owner));
    expect(response.status).toBe(409);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it("2ページ目に継続契約がある場合も削除しない", async () => {
    const owner = await user();
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_paginated" } });
    authState.user = owner;
    stripeMocks.list
      .mockResolvedValueOnce({ data: [{ id: "sub_cancelled_page_1", status: "canceled" }], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: "sub_active_page_2", status: "active" }], has_more: false });

    const response = await deleteAccount(request(owner));
    expect(response.status).toBe(409);
    expect(stripeMocks.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ starting_after: "sub_cancelled_page_1" }));
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
  });

  it("Stripeのページ応答が矛盾する場合はfail-closedで削除しない", async () => {
    const owner = await user();
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_broken_pagination" } });
    authState.user = owner;
    stripeMocks.list.mockResolvedValueOnce({ data: [], has_more: true });

    const response = await deleteAccount(request(owner));
    expect(response.status).toBe(502);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
  });

  it("確認語句・メールアドレスが一致しない場合は削除しない", async () => {
    const owner = await user();
    authState.user = owner;
    expect((await deleteAccount(request(owner, { confirmText: "削除" }))).status).toBe(400);
    expect((await deleteAccount(request(owner, { email: "different@invalid.example" }))).status).toBe(400);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(1);
    expect(clearSessionMock).not.toHaveBeenCalled();
  });
});
