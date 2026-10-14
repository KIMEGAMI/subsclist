import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxyMocks = vi.hoisted(() => ({
  getMaintenanceMode: vi.fn(),
  findUser: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({
  getMaintenanceMode: proxyMocks.getMaintenanceMode,
}));
vi.mock("@/lib/auth", () => ({ isAdminEmail: vi.fn(() => false) }));
vi.mock("@/lib/demo-readonly", () => ({
  shouldBlockDemoMutation: vi.fn(() => false),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: proxyMocks.findUser } },
}));
vi.mock("@/lib/signed-session", () => ({
  decodeSignedSession: vi.fn(() => null),
  SESSION_COOKIE_NAME: "subsc_session",
}));

import { proxy } from "@/proxy";

const originalAppUrl = process.env.APP_URL;

beforeEach(() => {
  process.env.APP_URL = "http://127.0.0.1:3100";
  proxyMocks.getMaintenanceMode.mockResolvedValue(false);
  proxyMocks.findUser.mockResolvedValue(null);
});

afterAll(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

function post(path: string, origin?: string) {
  return new NextRequest(`http://127.0.0.1:3100${path}`, {
    method: "POST",
    headers: origin ? { origin } : undefined,
  });
}

describe("Next.js Proxy CSRF boundary", () => {
  it("管理APIの不正Originを管理処理より前に拒否する", async () => {
    const response = await proxy(
      post("/api/admin/news/sync", "https://attacker.invalid"),
    );

    expect(response.status).toBe(403);
    expect(proxyMocks.getMaintenanceMode).not.toHaveBeenCalled();
  });

  it("管理APIの正しいOriginはメンテナンス判定を通さずRoute Handlerへ進む", async () => {
    const response = await proxy(
      post("/api/admin/news/sync", "http://127.0.0.1:3100"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(proxyMocks.getMaintenanceMode).not.toHaveBeenCalled();
  });

  it("Stripe署名検証ルートはブラウザーOriginを要求しない", async () => {
    const response = await proxy(post("/api/stripe/webhook"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(proxyMocks.getMaintenanceMode).not.toHaveBeenCalled();
  });
});
