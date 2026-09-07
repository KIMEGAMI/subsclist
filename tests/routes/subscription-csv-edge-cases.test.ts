import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CSV_IMPORT_ERROR_COUNT, MAX_CSV_IMPORT_FILE_BYTES, MAX_CSV_IMPORT_ROWS } from "@/lib/app-constants";
import { SUBSCRIPTION_IMPORT_HEADERS } from "@/lib/subscription-csv-import";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST as importSubscriptions } from "@/app/api/import/subscriptions/route";
import { POST as previewSubscriptions } from "@/app/api/import/subscriptions/preview/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

function row(values: { name: string; price?: string; payment?: string; currency?: string; sourceAmount?: string; rate?: string }) {
  return [
    values.name,
    values.price ?? "1490",
    "MONTHLY",
    "2026-10-01",
    "仕事",
    values.payment ?? "",
    "https://service.example.invalid/",
    "",
    "テスト取込",
    "",
    "100",
    "DIRECT",
    values.currency ?? "JPY",
    values.sourceAmount ?? "",
    values.rate ?? "",
    values.currency && values.currency !== "JPY" ? "2026-09-01" : "",
    "通信費",
  ].join(",");
}

function csv(...rows: string[]) {
  return `${SUBSCRIPTION_IMPORT_HEADERS.join(",")}\n${rows.join("\n")}`;
}

function request(content?: string) {
  const form = new FormData();
  if (content !== undefined) form.set("file", new File([content], "subscriptions.csv", { type: "text/csv" }));
  return new Request("http://127.0.0.1:3100/api/import/subscriptions", { method: "POST", body: form });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("契約CSVプレビュー", () => {
  it("本人のStripe対応支払い方法だけを利用可能として判定する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const supportedName = uniqueLabel("SupportedCard");
    const unsupportedName = uniqueLabel("UnsupportedWallet");
    const foreignName = uniqueLabel("ForeignCard");
    await prisma.paymentMethod.createMany({ data: [
      { userId: owner.id, name: supportedName, type: "CREDIT_CARD" },
      { userId: owner.id, name: unsupportedName, type: "PAYPAL" },
      { userId: other.id, name: foreignName, type: "CREDIT_CARD" },
    ] });
    authState.user = owner;
    const response = await previewSubscriptions(request(csv(
      row({ name: uniqueLabel("Valid"), payment: supportedName }),
      row({ name: uniqueLabel("Unsupported"), payment: unsupportedName }),
      row({ name: uniqueLabel("Foreign"), payment: foreignName }),
    )));
    const body = (await response.json()) as { rows: Array<{ valid: boolean; issues: string[] }>; validCount: number; invalidCount: number };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ validCount: 1, invalidCount: 2 });
    expect(body.rows[0].valid).toBe(true);
    expect(body.rows[1].issues.join(" ")).toContain("支払い方法");
    expect(body.rows[2].issues.join(" ")).toContain("支払い方法");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("既存契約とCSV内の表記ゆれ重複を検出する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    await prisma.subscription.create({ data: { userId: owner.id, name: "既存SaaS", price: 980, billingCycle: "MONTHLY", nextBillingDate: new Date("2026-10-01T00:00:00.000Z") } });
    authState.user = owner;
    const response = await previewSubscriptions(request(csv(
      row({ name: "既存ＳａａＳ" }),
      row({ name: "新規SaaS" }),
      row({ name: "新規ＳａａＳ" }),
    )));
    const body = (await response.json()) as { rows: Array<{ valid: boolean; issues: string[] }> };
    expect(body.rows[0].issues.join(" ")).toContain("既に登録");
    expect(body.rows[1].valid).toBe(true);
    expect(body.rows[2].issues.join(" ")).toContain("CSV内で重複");
  });

  it("ファイル未指定・上限超過・空CSVを拒否する", async () => {
    authState.user = await user({ plan: "PREMIUM" });
    expect((await previewSubscriptions(request())).status).toBe(400);
    expect((await previewSubscriptions(request("x".repeat(MAX_CSV_IMPORT_FILE_BYTES + 1)))).status).toBe(400);
    expect((await previewSubscriptions(request(SUBSCRIPTION_IMPORT_HEADERS.join(",")))).status).toBe(400);
  });

  it("最大200行を受け付け、201行はDB更新前に拒否する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    authState.user = owner;
    const rows = Array.from({ length: MAX_CSV_IMPORT_ROWS }, (_value, index) =>
      row({ name: `BoundaryService${index + 1}` })
    );
    const accepted = await previewSubscriptions(request(csv(...rows)));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ validCount: MAX_CSV_IMPORT_ROWS, invalidCount: 0 });

    const rejected = await importSubscriptions(request(csv(
      ...rows,
      row({ name: "BoundaryServiceOverLimit" }),
    )));
    expect(rejected.status).toBe(400);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
  });
});

describe("契約CSV確定取込", () => {
  it("正常行だけを登録し、不正行とCSV内重複を理由付きでスキップする", async () => {
    const owner = await user({ plan: "PREMIUM" });
    authState.user = owner;
    const name = uniqueLabel("MixedImport");
    const response = await importSubscriptions(request(csv(
      row({ name }),
      row({ name: "", price: "invalid" }),
      row({ name: name.toLocaleUpperCase("ja-JP") }),
    )));
    const body = (await response.json()) as { created: number; skipped: number; errors: string[] };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ created: 1, skipped: 2 });
    expect(body.errors.join(" ")).toMatch(/3行目|4行目/);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(1);
    expect(await prisma.notificationSetting.count({ where: { userId: owner.id } })).toBe(1);
  });

  it("外貨契約を原通貨額・換算レートとともに保存する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    authState.user = owner;
    const name = uniqueLabel("UsdImport");
    const response = await importSubscriptions(request(csv(row({ name, price: "1499", currency: "USD", sourceAmount: "9.99", rate: "150.0501" }))));
    expect(response.status).toBe(200);
    expect(await prisma.subscription.findFirstOrThrow({ where: { userId: owner.id, name } })).toMatchObject({
      currency: "USD",
      sourceAmountMinor: 999,
      exchangeRateToJpyScaled: 1500501,
      price: 1499,
    });
  });

  it("不正行をすべて数えつつ、返す詳細理由を既定上限に抑える", async () => {
    const owner = await user({ plan: "PREMIUM" });
    authState.user = owner;
    const invalidRows = Array.from({ length: MAX_CSV_IMPORT_ERROR_COUNT + 3 }, () =>
      row({ name: "", price: "invalid" })
    );
    const response = await importSubscriptions(request(csv(...invalidRows)));
    const body = (await response.json()) as { created: number; skipped: number; errors: string[] };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ created: 0, skipped: invalidRows.length });
    expect(body.errors).toHaveLength(MAX_CSV_IMPORT_ERROR_COUNT);
    expect(await prisma.subscription.count({ where: { userId: owner.id } })).toBe(0);
  });
});
