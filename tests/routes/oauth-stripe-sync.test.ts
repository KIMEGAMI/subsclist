import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser, uniqueLabel } from "../helpers/database";

const cookieValues = vi.hoisted(() => new Map<string, string>());
const cookieMock = vi.hoisted(() => ({
  get: vi.fn((name: string) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined),
  set: vi.fn((name: string, value: string) => { cookieValues.set(name, value); }),
}));
const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const syncMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const newDeviceMailMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("next/headers", () => ({ cookies: async () => cookieMock }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, setSession: sessionMock };
});
vi.mock("@/lib/stripe-billing", () => ({
  syncLatestStripeSubscriptionForUser: syncMock,
}));
vi.mock("@/lib/mail", () => ({ sendNewDeviceLoginEmail: newDeviceMailMock }));

import { GET as googleStart } from "@/app/api/auth/google/start/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";
import { POST as stripeSync } from "@/app/api/stripe/sync/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  cookieValues.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  newDeviceMailMock.mockResolvedValue(undefined);
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Google OAuth", () => {
  it("開始時にstate・PKCE CookieとGoogle認証URLを作る", async () => {
    const response = await googleStart();
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("state")).not.toBeNull();
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookieMock.set).toHaveBeenCalledTimes(2);
  });

  it("state不一致ではGoogle APIを呼ばずログインへ戻す", async () => {
    cookieValues.set("subsclist_google_oauth_state", "saved-state");
    cookieValues.set("subsclist_google_oauth_verifier", uniqueLabel("Verifier"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await googleCallback(new NextRequest("http://127.0.0.1:3100/api/auth/google/callback?code=code&state=wrong"));
    expect(response.headers.get("location")).toContain("google=invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookieMock.set).toHaveBeenCalledWith("subsclist_google_oauth_state", "", expect.objectContaining({ maxAge: 0 }));
    expect(cookieMock.set).toHaveBeenCalledWith("subsclist_google_oauth_verifier", "", expect.objectContaining({ maxAge: 0 }));
  });

  it.each([
    ["トークン応答エラー", [new Response("{}", { status: 400 })]],
    ["未検証プロフィール", [
      Response.json({ access_token: uniqueLabel("AccessToken") }),
      Response.json({ sub: uniqueLabel("GoogleSub"), email: `${uniqueLabel("unverified_google")}@invalid.example`, email_verified: false }),
    ]],
  ] as const)("%sではユーザーを作成せず失敗として戻す", async (_label, responses) => {
    const state = uniqueLabel("OAuthFailureState");
    cookieValues.set("subsclist_google_oauth_state", state);
    cookieValues.set("subsclist_google_oauth_verifier", uniqueLabel("Verifier"));
    const fetchMock = vi.fn();
    for (const response of responses) fetchMock.mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetchMock);
    const before = await prisma.user.count();

    const result = await googleCallback(new NextRequest(`http://127.0.0.1:3100/api/auth/google/callback?code=code&state=${state}`));
    expect(result.headers.get("location")).toContain("google=failed");
    expect(await prisma.user.count()).toBe(before);
    expect(sessionMock).not.toHaveBeenCalled();
  });

  it("検証済みGoogleプロフィールから新規ユーザーを作成する", async () => {
    const state = uniqueLabel("OAuthState");
    cookieValues.set("subsclist_google_oauth_state", state);
    cookieValues.set("subsclist_google_oauth_verifier", uniqueLabel("Verifier"));
    const email = `${uniqueLabel("google_user")}@invalid.example`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: uniqueLabel("AccessToken") }))
      .mockResolvedValueOnce(Response.json({ sub: uniqueLabel("GoogleSub"), email, email_verified: true, name: "Googleテスト" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await googleCallback(new NextRequest(`http://127.0.0.1:3100/api/auth/google/callback?code=code&state=${state}`));
    const saved = await prisma.user.findUnique({ where: { email } });
    if (saved) createdUserIds.push(saved.id);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3100/dashboard");
    expect(saved).toMatchObject({ emailVerified: expect.any(Date), name: "Googleテスト" });
    expect(sessionMock).toHaveBeenCalledWith(saved?.id, true);
  });

  it("既存ユーザーを検証済みにし、新端末通知失敗でもログインを完了する", async () => {
    const owner = await createTestUser({ verified: false, name: "既存ユーザー" });
    createdUserIds.push(owner.id);
    await prisma.trustedLoginDevice.create({
      data: { userId: owner.id, tokenHash: uniqueLabel("known-device-hash"), clientLabel: "既存端末" },
    });
    const state = uniqueLabel("ExistingOAuthState");
    cookieValues.set("subsclist_google_oauth_state", state);
    cookieValues.set("subsclist_google_oauth_verifier", uniqueLabel("Verifier"));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ access_token: uniqueLabel("AccessToken") }))
      .mockResolvedValueOnce(Response.json({ sub: uniqueLabel("GoogleSub"), email: owner.email, email_verified: true, name: "Google側の名前" })));
    newDeviceMailMock.mockRejectedValueOnce(new Error("mail provider unavailable"));

    const response = await googleCallback(new NextRequest(`http://127.0.0.1:3100/api/auth/google/callback?code=code&state=${state}`));
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3100/dashboard");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified).toBeInstanceOf(Date);
    expect(sessionMock).toHaveBeenCalledWith(owner.id, true);
    expect(newDeviceMailMock).toHaveBeenCalledOnce();
  });
});

describe("Stripe課金状態同期", () => {
  it("未ログインを拒否する", async () => {
    expect((await stripeSync()).status).toBe(401);
  });

  it.each([
    ["premium", 200, false],
    ["attention", 200, true],
    ["free", 200, false],
    ["stale_subscription", 409, false],
    ["stale_customer", 409, false],
    ["missing", 404, false],
  ] as const)("同期結果 %s を日本語応答へ変換する", async (status, expectedStatus, attention) => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    syncMock.mockResolvedValue(status);
    const response = await stripeSync();
    expect(response.status).toBe(expectedStatus);
    const body = (await response.json()) as { message: string; attention?: boolean };
    expect(body.message).toMatch(/Stripe|Premium/);
    expect(Boolean(body.attention)).toBe(attention);
  });

  it("Stripe通信失敗を500へ変換する", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    syncMock.mockRejectedValue(new Error("provider unavailable"));
    const response = await stripeSync();
    expect(response.status).toBe(500);
  });
});
