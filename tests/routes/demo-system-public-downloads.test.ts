import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const setSessionMock = vi.hoisted(() => vi.fn(async () => undefined));
const maintenanceState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getCurrentUser: async () => authState.user,
    setSession: setSessionMock,
  };
});
vi.mock("@/lib/admin", () => ({ getMaintenanceMode: async () => maintenanceState.enabled }));

import { POST as demoLogin } from "@/app/api/auth/demo-login/route";
import { GET as downloadStatementSample } from "@/app/api/import/statement-sample/route";
import { GET as downloadImportTemplate } from "@/app/api/import/template/route";
import { GET as getSystemStatus } from "@/app/api/system/status/route";

const createdUserIds: string[] = [];

async function user(options?: Parameters<typeof createTestUser>[0]) {
  const created = await createTestUser(options);
  createdUserIds.push(created.id);
  return created;
}

afterEach(async () => {
  authState.user = null;
  maintenanceState.enabled = false;
  setSessionMock.mockClear();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("デモログイン", () => {
  it("設定された認証済みデモユーザーだけをセッション化する", async () => {
    const demo = await user({ email: env.demoUserEmail, verified: true, plan: "PREMIUM" });
    await user({ email: env.adminUserEmail, verified: true, plan: "PREMIUM" });
    const response = await demoLogin();
    expect(response.status).toBe(200);
    expect(setSessionMock).toHaveBeenCalledWith(demo.id, true);
    expect(setSessionMock).not.toHaveBeenCalledWith(expect.stringContaining("admin"), true);
  });

  it("デモユーザー未登録と未認証を拒否する", async () => {
    expect((await demoLogin()).status).toBe(404);
    await user({ email: env.demoUserEmail, verified: false });
    expect((await demoLogin()).status).toBe(409);
    expect(setSessionMock).not.toHaveBeenCalled();
  });
});

describe("システム状態", () => {
  it("メンテナンス状態を返し、認証済み管理者だけを識別する", async () => {
    maintenanceState.enabled = true;
    let response = await getSystemStatus();
    expect(await response.json()).toEqual({ maintenance: true, isAdmin: false });
    expect(response.headers.get("cache-control")).toBe("no-store");

    authState.user = await user({ email: env.adminUserEmail, verified: true });
    response = await getSystemStatus();
    expect(await response.json()).toEqual({ maintenance: true, isAdmin: true });
  });

  it("未認証管理者と一般ユーザーを管理者扱いしない", async () => {
    authState.user = await user({ email: env.adminUserEmail, verified: false });
    expect(await (await getSystemStatus()).json()).toMatchObject({ isAdmin: false });
    authState.user = await user({ verified: true });
    expect(await (await getSystemStatus()).json()).toMatchObject({ isAdmin: false });
  });
});

describe("公開CSVダウンロード", () => {
  it.each([
    ["明細サンプル", downloadStatementSample, "subsclist-statement-sample.csv", "利用日"],
    ["契約取込テンプレート", downloadImportTemplate, "subsclist-import-template.csv", "サービス名"],
  ])("%sをUTF-8 BOM付きCSVとして返す", async (_label, download, filename, header) => {
    const response = download();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const csv = new TextDecoder().decode(bytes);
    expect(response.status).toBe(200);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(filename);
    expect(csv).toContain(header);
  });
});
