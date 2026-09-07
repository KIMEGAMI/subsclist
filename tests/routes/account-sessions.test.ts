import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
const cookieDeleteMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: cookieDeleteMock,
  }),
}));

import { POST as revokeSessions } from "@/app/api/settings/security/sessions/route";

const createdUserIds: string[] = [];

afterEach(async () => {
  authState.user = null;
  vi.clearAllMocks();
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("全ログインセッション失効", () => {
  it("未ログインではDBとCookieを変更しない", async () => {
    expect((await revokeSessions()).status).toBe(401);
    expect(cookieDeleteMock).not.toHaveBeenCalled();
  });

  it("sessionVersionを更新し、信頼済み端末を削除して監査履歴を残す", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    authState.user = owner;
    await prisma.trustedLoginDevice.createMany({
      data: [
        { userId: owner.id, tokenHash: "1".repeat(64), clientLabel: "端末1" },
        { userId: owner.id, tokenHash: "2".repeat(64), clientLabel: "端末2" },
      ],
    });

    const response = await revokeSessions();
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).sessionVersion).toBe(owner.sessionVersion + 1);
    expect(await prisma.trustedLoginDevice.count({ where: { userId: owner.id } })).toBe(0);
    expect(await prisma.loginSecurityEvent.count({ where: { userId: owner.id, type: "ALL_SESSIONS_REVOKED" } })).toBe(1);
    expect(cookieDeleteMock).toHaveBeenCalledTimes(2);
  });
});
