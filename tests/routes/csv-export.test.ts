import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () =>
    authState.user
      ? { ok: true as const, user: authState.user }
      : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { GET as exportSubscriptions } from "@/app/api/export/route";
import { POST as previewSubscriptions } from "@/app/api/import/subscriptions/preview/route";

const createdUserIds: string[] = [];
async function user() {
  const created = await createTestUser();
  createdUserIds.push(created.id);
  return created;
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("CSVとユーザー分離", () => {
  it("Exportに他ユーザーの契約を含めない", async () => {
    const owner = await user();
    const other = await user();
    const ownerName = uniqueLabel("OwnerExport");
    const otherName = uniqueLabel("OtherExport");
    await prisma.subscription.createMany({
      data: [owner, other].map((item, index) => ({
        userId: item.id,
        name: index === 0 ? ownerName : otherName,
        price: 980,
        billingCycle: "MONTHLY",
        nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
        status: "ACTIVE",
      })),
    });
    authState.user = owner;
    const response = await exportSubscriptions();
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(csv).toContain(ownerName);
    expect(csv).not.toContain(otherName);
    expect(response.headers.get("content-type")).toContain("text/csv");
  });

  it("CSVプレビューはDBを変更しない", async () => {
    const owner = await user();
    authState.user = owner;
    const before = await prisma.subscription.count({ where: { userId: owner.id } });
    const form = new FormData();
    form.set(
      "file",
      new File(
        ["サービス名,金額,請求周期,次回更新日,ステータス\nPreviewOnly,980,MONTHLY,2026-10-01,ACTIVE"],
        "subscriptions.csv",
        { type: "text/csv" },
      ),
    );
    const response = await previewSubscriptions(
      new Request("http://localhost:3100/api/import/subscriptions/preview", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(before);
  });

  it("ユーザー入力が数式として表計算ソフトで実行されないよう無害化する", async () => {
    const owner = await user();
    const category = await prisma.category.create({
      data: { userId: owner.id, name: "+SUM(A1:A2)", color: "#2563eb" },
    });
    await prisma.subscription.create({
      data: {
        userId: owner.id,
        categoryId: category.id,
        name: "=HYPERLINK(\"https://invalid.example\")",
        price: 980,
        billingCycle: "MONTHLY",
        nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
        memo: "@SUM(1+1)",
      },
    });
    authState.user = owner;

    const csv = await (await exportSubscriptions()).text();
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://invalid.example\"\")\"");
    expect(csv).toContain("\"'+SUM(A1:A2)\"");
    expect(csv).toContain("\"'@SUM(1+1)\"");
  });
});
