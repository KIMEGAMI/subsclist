import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : {
          ok: false as const,
          response: Response.json({ message: "ログインしてください。" }, { status: 401 }),
        },
}));

import { POST } from "@/app/api/import/subscriptions/route";

const createdUserIds: string[] = [];
const header = "サービス名,料金,請求周期,次回更新日,カテゴリ,支払い方法";

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function request(csv: string) {
  const form = new FormData();
  form.set("file", new File([csv], "subscriptions.csv", { type: "text/csv" }));
  return new Request("http://127.0.0.1:3100/api/import/subscriptions", {
    method: "POST",
    body: form,
  });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("CSV Subscription importとMySQL", () => {
  it("Freeプランのインポートを拒否しDBを変更しない", async () => {
    const owner = await user({ plan: "FREE" });
    authState.user = owner;
    const response = await POST(request(`${header}\n${uniqueLabel("FreeCsv")},980,MONTHLY,2026-10-01,,`));

    expect(response.status).toBe(403);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("Premiumの正常行を所有者のSubscription・Category・通知設定へ保存する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    authState.user = owner;
    const name = uniqueLabel("ImportedCsv");
    const categoryName = uniqueLabel("ImportedCategory");
    const response = await POST(request(`${header}\n${name},1480,MONTHLY,2026-10-01,${categoryName},`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 1, skipped: 0 });
    const saved = await prisma.subscription.findFirstOrThrow({
      where: { userId: owner.id, name },
      include: { category: true, notificationSettings: true },
    });
    expect(saved.category).toMatchObject({ userId: owner.id, name: categoryName });
    expect(saved.notificationSettings).toEqual([
      expect.objectContaining({ userId: owner.id, enabled: true }),
    ]);
  });

  it("他ユーザーだけが持つ支払い方法名を参照せず行をスキップする", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const paymentName = uniqueLabel("OtherPayment");
    await prisma.paymentMethod.create({
      data: { userId: other.id, name: paymentName, type: "CREDIT_CARD" },
    });
    authState.user = owner;
    const response = await POST(request(`${header}\n${uniqueLabel("BlockedCsv")},980,MONTHLY,2026-10-01,,${paymentName}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: 0, skipped: 1 });
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
  });
});
