import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";

type ApiUser = {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  sessionVersion: number;
  plan: "FREE" | "PREMIUM" | "LIFETIME";
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  user: null as ApiUser | null,
  maintenance: false,
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getCurrentUser: async () => state.user };
});
vi.mock("@/lib/admin", () => ({ getMaintenanceMode: async () => state.maintenance }));

import { getAdminApiUser, getVerifiedApiUser } from "@/lib/api-auth";

function currentUser(overrides: Partial<ApiUser> = {}): ApiUser {
  return {
    id: "api-auth-test-user",
    name: "認可テスト",
    email: "member@example.invalid",
    emailVerified: new Date(),
    sessionVersion: 0,
    plan: "PREMIUM",
    createdAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  state.user = null;
  state.maintenance = false;
});

describe("API認証とメンテナンス境界", () => {
  it("未ログインとメール未認証を区別して拒否する", async () => {
    const loggedOut = await getVerifiedApiUser();
    expect(loggedOut.ok).toBe(false);
    if (!loggedOut.ok) expect(loggedOut.response.status).toBe(401);

    state.user = currentUser({ emailVerified: null });
    const unverified = await getVerifiedApiUser();
    expect(unverified.ok).toBe(false);
    if (!unverified.ok) expect(unverified.response.status).toBe(403);
  });

  it("メンテナンス中は一般ユーザーだけを503で拒否する", async () => {
    state.maintenance = true;
    state.user = currentUser();
    const member = await getVerifiedApiUser();
    expect(member.ok).toBe(false);
    if (!member.ok) {
      expect(member.response.status).toBe(503);
      expect(member.response.headers.get("retry-after")).toBe("300");
    }

    state.user = currentUser({ email: env.adminUserEmail });
    expect((await getVerifiedApiUser()).ok).toBe(true);
  });

  it("管理者APIは認証済みの管理者メールだけを許可する", async () => {
    state.user = currentUser();
    const member = await getAdminApiUser();
    expect(member.ok).toBe(false);
    if (!member.ok) expect(member.response.status).toBe(403);

    state.user = currentUser({ email: env.adminUserEmail, emailVerified: null });
    expect((await getAdminApiUser()).ok).toBe(false);
    state.user = currentUser({ email: env.adminUserEmail });
    expect((await getAdminApiUser()).ok).toBe(true);
  });
});
