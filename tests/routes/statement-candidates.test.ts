import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CSV_IMPORT_FILE_BYTES } from "@/lib/app-constants";
import { normalizeStatementMerchant } from "@/lib/statement-import";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST as analyzeCandidates } from "@/app/api/import/candidates/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

async function subscription(userId: string, name: string) {
  return prisma.subscription.create({
    data: {
      userId,
      name,
      price: 1490,
      billingCycle: "MONTHLY",
      nextBillingDate: new Date("2026-10-01T00:00:00.000Z"),
    },
  });
}

function csvRequest(csv?: string, filename = "statement.csv") {
  const form = new FormData();
  if (csv !== undefined) form.set("file", new File([csv], filename, { type: "text/csv" }));
  return new Request("http://127.0.0.1:3100/api/import/candidates", { method: "POST", body: form });
}

afterEach(async () => {
  authState.user = null;
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("CSV明細のサブスク候補解析", () => {
  it("未ログインとFreeプランを拒否する", async () => {
    const csv = "利用日,摘要,金額\n2026-06-01,NETFLIX.COM,1490";
    expect((await analyzeCandidates(csvRequest(csv))).status).toBe(401);
    authState.user = await user({ plan: "FREE" });
    expect((await analyzeCandidates(csvRequest(csv))).status).toBe(403);
  });

  it("ファイル未指定・上限超過・不正CSVを拒否する", async () => {
    authState.user = await user({ plan: "PREMIUM" });
    expect((await analyzeCandidates(csvRequest())).status).toBe(400);
    expect((await analyzeCandidates(csvRequest("x".repeat(MAX_CSV_IMPORT_FILE_BYTES + 1)))).status).toBe(400);
    const malformed = await analyzeCandidates(csvRequest('利用日,摘要,金額\n"2026-06-01,NETFLIX.COM,1490'));
    expect(malformed.status).toBe(400);
  });

  it("保存済み名義から本人の契約だけを候補として返す", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const other = await user({ plan: "PREMIUM" });
    const ownedName = uniqueLabel("OWNED_NETFLIX");
    const foreignName = uniqueLabel("FOREIGN_SECRET_SUBSCRIPTION");
    const owned = await subscription(owner.id, ownedName);
    const foreign = await subscription(other.id, foreignName);
    await prisma.statementMerchantAlias.create({
      data: {
        userId: owner.id,
        subscriptionId: owned.id,
        merchantLabel: "NETFLIX.COM",
        normalizedMerchant: normalizeStatementMerchant("NETFLIX.COM"),
      },
    });
    authState.user = owner;
    const csv = [
      "利用日,摘要,金額",
      "2026-06-01,NETFLIX.COM,1490",
      "2026-07-01,NETFLIX.COM,1490",
    ].join("\n");
    const response = await analyzeCandidates(csvRequest(csv));
    const body = (await response.json()) as {
      candidates: Array<{ existingSubscriptionId: string | null; name: string }>;
      subscriptionOptions: Array<{ id: string; name: string }>;
    };
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body.candidates[0]).toMatchObject({ existingSubscriptionId: owned.id, name: ownedName });
    expect(body.subscriptionOptions).toEqual([{ id: owned.id, name: ownedName, status: "ACTIVE" }]);
    expect(JSON.stringify(body)).not.toContain(foreign.id);
    expect(JSON.stringify(body)).not.toContain(foreignName);
  });

  it("同じユーザーの既存支払いを重複として照合する", async () => {
    const owner = await user({ plan: "PREMIUM" });
    const item = await subscription(owner.id, "Netflix");
    await prisma.paymentHistory.create({
      data: {
        userId: owner.id,
        subscriptionId: item.id,
        subscriptionNameSnapshot: item.name,
        amount: 1490,
        paidAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    authState.user = owner;
    const response = await analyzeCandidates(csvRequest("利用日,摘要,金額\n2026-06-01,NETFLIX.COM,1490"));
    const body = (await response.json()) as { paymentMatches: Array<{ duplicate: boolean }> };
    expect(response.status).toBe(200);
    expect(body.paymentMatches.some((match) => match.duplicate)).toBe(true);
  });
});
