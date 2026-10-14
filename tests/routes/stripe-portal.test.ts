import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const stripeMocks = vi.hoisted(() => {
  const customerRetrieve = vi.fn();
  const customerList = vi.fn();
  const subscriptionRetrieve = vi.fn();
  const subscriptionList = vi.fn();
  const portalCreate = vi.fn();
  const profileSync = vi.fn();
  const stripe = vi.fn(() => ({
    customers: { retrieve: customerRetrieve, list: customerList },
    subscriptions: { retrieve: subscriptionRetrieve, list: subscriptionList },
    billingPortal: { sessions: { create: portalCreate } },
  }));
  return { customerRetrieve, customerList, subscriptionRetrieve, subscriptionList, portalCreate, profileSync, stripe };
});
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/stripe", () => ({
  stripe: stripeMocks.stripe,
}));
vi.mock("@/lib/stripe-billing", () => ({
  activePlan: (status: string) => status === "active" || status === "trialing" ? "PREMIUM" : "FREE",
  syncStripeSubscription: vi.fn(async () => true),
}));
vi.mock("@/lib/stripe-customer-profile", () => ({
  syncStripeCustomerProfile: stripeMocks.profileSync,
}));

import { POST } from "@/app/api/stripe/portal/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  authState.user = null;
  vi.clearAllMocks();
  stripeMocks.customerList.mockResolvedValue({ data: [] });
  stripeMocks.subscriptionList.mockResolvedValue({ data: [] });
  stripeMocks.profileSync.mockResolvedValue(true);
  stripeMocks.portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" });
  stripeMocks.stripe.mockImplementation(() => ({
    customers: { retrieve: stripeMocks.customerRetrieve, list: stripeMocks.customerList },
    subscriptions: { retrieve: stripeMocks.subscriptionRetrieve, list: stripeMocks.subscriptionList },
    billingPortal: { sessions: { create: stripeMocks.portalCreate } },
  }));
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Stripe Portal", () => {
  it("未ログインを拒否する", async () => {
    expect((await POST()).status).toBe(401);
  });

  it("所有者metadataが一致する顧客だけでPortalを作成する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ url: "https://billing.stripe.test/session" });
    expect(stripeMocks.portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_owned" }));
  });

  it("別ユーザーmetadataの顧客ではPortalを作成せず登録情報を維持する", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_foreign" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_foreign", deleted: false, metadata: { userId: other.id } });

    const response = await POST();

    expect(response.status).toBe(409);
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).stripeCustomerId).toBe("cus_foreign");
  });

  it("Free状態でも本人metadataが一致する契約ならメールから復旧する", async () => {
    const owner = await createTestUser({ plan: "FREE" });
    createdUserIds.push(owner.id);
    authState.user = owner;
    stripeMocks.customerList.mockResolvedValue({
      data: [{ id: "cus_email_recovery", metadata: { userId: owner.id } }],
    });
    stripeMocks.subscriptionList.mockResolvedValue({
      data: [{
        id: "sub_email_recovery",
        status: "active",
        customer: "cus_email_recovery",
        items: { data: [{ current_period_end: 1_800_000_000 }] },
        metadata: { userId: owner.id },
      }],
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(stripeMocks.customerList).toHaveBeenCalledWith({ email: owner.email, limit: 10 });
    expect(stripeMocks.subscriptionList).toHaveBeenCalledWith({
      customer: "cus_email_recovery",
      status: "all",
      limit: 10,
    });
    expect(stripeMocks.portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_email_recovery" }),
    );
  });

  it("メール一致でもSubscriptionが別ユーザー所有ならPortalを作らない", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    authState.user = owner;
    stripeMocks.customerList.mockResolvedValue({
      data: [{ id: "cus_email_collision", metadata: { userId: owner.id } }],
    });
    stripeMocks.subscriptionList.mockResolvedValue({
      data: [{
        id: "sub_foreign_owner",
        status: "active",
        customer: "cus_email_collision",
        metadata: { userId: other.id },
      }],
    });

    const response = await POST();

    expect(response.status).toBe(409);
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
  });

  it("Stripeで契約を解決できなくても既存Premiumと課金IDを変更しない", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({
      where: { id: owner.id },
      data: { stripeCustomerId: "cus_missing", stripeSubscriptionId: "sub_missing" },
    });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockRejectedValue({
      code: "resource_missing",
      param: "customer",
    });
    stripeMocks.subscriptionRetrieve.mockRejectedValue({
      code: "resource_missing",
      param: "subscription",
    });
    stripeMocks.customerList.mockResolvedValue({ data: [] });

    const response = await POST();
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });

    expect(response.status).toBe(409);
    expect(persisted).toMatchObject({
      plan: "PREMIUM",
      stripeCustomerId: "cus_missing",
      stripeSubscriptionId: "sub_missing",
    });
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
  });

  it("顧客プロフィールの所有者を確認できない場合はPortalを開かない", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_unverified" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_unverified", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.profileSync.mockResolvedValue(false);
    const response = await POST();
    expect(response.status).toBe(409);
    expect(stripeMocks.portalCreate).not.toHaveBeenCalled();
  });

  it("現在のモードに存在しないPortal設定IDを特定できる案内を返す", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.portalCreate.mockRejectedValue({
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      param: "configuration",
      statusCode: 400,
      requestId: "req_test123",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: "STRIPE_PORTAL_CONFIGURATION_INVALID",
      message: expect.stringContaining("STRIPE_PORTAL_CONFIGURATION_ID"),
    });
    expect(JSON.stringify(body)).not.toContain("req_test123");
  });

  it("Stripe APIキーの権限不足を専用コードで案内する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.portalCreate.mockRejectedValue({
      type: "StripePermissionError",
      statusCode: 403,
      requestId: "req_permission123",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: "STRIPE_PERMISSION_DENIED",
      message: expect.stringContaining("必要な権限がありません"),
    });
    expect(JSON.stringify(body)).not.toContain("req_permission123");
  });

  it("開発環境でStripe本番キーを拒否した場合にテストキーへ誘導する", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    authState.user = owner;
    stripeMocks.stripe.mockImplementationOnce(() => {
      throw new Error("Stripe Live mode requires STRIPE_LIVE_MODE_ALLOWED=true and is disabled in test environments.");
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: "STRIPE_LIVE_KEY_NOT_ALLOWED",
      message: expect.stringContaining("sk_test_..."),
    });
  });

  it("予期しないnull例外でも安全なエラー応答を返す", async () => {
    const owner = await createTestUser({ plan: "PREMIUM" });
    createdUserIds.push(owner.id);
    await prisma.user.update({ where: { id: owner.id }, data: { stripeCustomerId: "cus_owned" } });
    authState.user = owner;
    stripeMocks.customerRetrieve.mockResolvedValue({ id: "cus_owned", deleted: false, metadata: { userId: owner.id } });
    stripeMocks.portalCreate.mockRejectedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({ code: "STRIPE_PORTAL_FAILED" });
    expect(errorSpy).toHaveBeenCalledWith(
      "Stripe portal creation failed.",
      expect.objectContaining({ stage: "portal_session" }),
    );
  });
});
