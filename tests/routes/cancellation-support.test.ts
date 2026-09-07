import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { PATCH as updateChecklist } from "@/app/api/cancellation-checklist/[id]/route";
import { POST as createEvidence } from "@/app/api/cancellation-evidences/route";
import { DELETE as deleteEvidence } from "@/app/api/cancellation-evidences/[id]/route";

const createdUserIds: string[] = [];

async function user(plan: "FREE" | "PREMIUM" = "PREMIUM") {
  const created = await createTestUser({ plan });
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string) {
  return prisma.subscription.create({
    data: { userId, name: uniqueLabel("CancelSubscription"), price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2026-10-01T00:00:00.000Z") },
  });
}

function request(payload: object, method = "POST") {
  return new Request("http://127.0.0.1:3100/api/cancellation", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("解約支援の所有者境界", () => {
  it("Freeプランでは証跡を作成しない", async () => {
    const owner = await user("FREE");
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await createEvidence(request({ subscriptionId: item.id, title: "解約受付", kind: "RECEIPT" }));
    expect(response.status).toBe(403);
    expect(await prisma.cancellationEvidence.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("所有者の証跡を保存し危険なURLをnullへ変換する", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    const response = await createEvidence(request({
      subscriptionId: item.id,
      title: "解約受付",
      kind: "RECEIPT",
      referenceUrl: "javascript:alert(1)",
    }));
    expect(response.status).toBe(200);
    expect(await prisma.cancellationEvidence.findFirst({ where: { userId: owner.id } })).toMatchObject({
      subscriptionId: item.id,
      referenceUrl: null,
    });
  });

  it("他ユーザーの契約への証跡作成と証跡削除を拒否する", async () => {
    const owner = await user();
    const attacker = await user();
    const item = await subscription(owner.id);
    const evidence = await prisma.cancellationEvidence.create({
      data: { userId: owner.id, subscriptionId: item.id, title: "所有者証跡", kind: "MEMO" },
    });
    authState.user = attacker;
    expect((await createEvidence(request({ subscriptionId: item.id, title: "侵入", kind: "MEMO" }))).status).toBe(404);
    expect((await deleteEvidence(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ id: evidence.id }) })).status).toBe(404);
    expect(await prisma.cancellationEvidence.count({ where: { id: evidence.id } })).toBe(1);
  });

  it("チェックリストは所有者だけが完了できる", async () => {
    const owner = await user();
    const attacker = await user();
    const item = await subscription(owner.id);
    const checklist = await prisma.cancellationChecklistItem.create({
      data: { userId: owner.id, subscriptionId: item.id, label: "解約完了メールを保存" },
    });
    authState.user = attacker;
    const blocked = await updateChecklist(request({ completed: true }, "PATCH"), { params: Promise.resolve({ id: checklist.id }) });
    authState.user = owner;
    const allowed = await updateChecklist(request({ completed: true }, "PATCH"), { params: Promise.resolve({ id: checklist.id }) });
    expect(blocked.status).toBe(404);
    expect(allowed.status).toBe(200);
    expect((await prisma.cancellationChecklistItem.findUniqueOrThrow({ where: { id: checklist.id } })).completedAt).toBeInstanceOf(Date);
  });

  it("Freeプランではチェックリストを変更できず、Premiumは完了を解除できる", async () => {
    const owner = await user("FREE");
    const item = await subscription(owner.id);
    const checklist = await prisma.cancellationChecklistItem.create({
      data: { userId: owner.id, subscriptionId: item.id, label: "解約完了メールを保存", completedAt: new Date() },
    });
    authState.user = owner;
    expect((await updateChecklist(request({ completed: false }, "PATCH"), { params: Promise.resolve({ id: checklist.id }) })).status).toBe(403);

    await prisma.user.update({ where: { id: owner.id }, data: { plan: "PREMIUM" } });
    authState.user = { ...owner, plan: "PREMIUM" };
    expect((await updateChecklist(request({ completed: false }, "PATCH"), { params: Promise.resolve({ id: checklist.id }) })).status).toBe(200);
    expect((await prisma.cancellationChecklistItem.findUniqueOrThrow({ where: { id: checklist.id } })).completedAt).toBeNull();
  });

  it("不正な記録日と過長タイトルの証跡を保存しない", async () => {
    const owner = await user();
    const item = await subscription(owner.id);
    authState.user = owner;
    const invalidDate = await createEvidence(request({
      subscriptionId: item.id,
      title: "解約受付",
      kind: "RECEIPT",
      recordedAt: "2026-02-30",
    }));
    const tooLongTitle = await createEvidence(request({
      subscriptionId: item.id,
      title: "a".repeat(101),
      kind: "MEMO",
    }));
    expect(invalidDate.status).toBe(400);
    expect(tooLongTitle.status).toBe(400);
    expect(await prisma.cancellationEvidence.count({ where: { userId: owner.id } })).toBe(0);
  });
});
