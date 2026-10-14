import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, deleteTestUsers, type TestUser } from "../helpers/database";

const authState = vi.hoisted(() => ({ user: null as TestUser | null }));
vi.mock("@/lib/api-auth", () => ({
  getVerifiedApiUser: async () => authState.user
    ? { ok: true as const, user: authState.user }
    : { ok: false as const, response: Response.json({ message: "ログインしてください。" }, { status: 401 }) },
}));

import { POST } from "@/app/api/service-watchlist/route";
import { DELETE } from "@/app/api/service-watchlist/[serviceId]/route";

const createdUserIds: string[] = [];
const serviceId = "service_chatgpt";

function createRequest(payload: object) {
  return new Request("http://127.0.0.1:3100/api/service-watchlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

afterEach(async () => {
  authState.user = null;
  await prisma.serviceWatchlist.deleteMany({ where: { serviceId } });
  await deleteTestUsers(...createdUserIds.splice(0));
});

describe("Service Watchlist", () => {
  it("Watchを追加し、同じサービスを重複登録しない", async () => {
    const owner = await createTestUser();
    createdUserIds.push(owner.id);
    await prisma.serviceMaster.upsert({ where: { id: serviceId }, update: { status: "ACTIVE" }, create: { id: serviceId, slug: serviceId, name: "ChatGPT", category: "AI", officialUrl: "https://example.com", status: "ACTIVE" } });
    authState.user = owner;
    expect((await POST(createRequest({ serviceId }))).status).toBe(200);
    expect((await POST(createRequest({ serviceId }))).status).toBe(200);
    expect(await prisma.serviceWatchlist.count({ where: { userId: owner.id, serviceId } })).toBe(1);
  });

  it("他ユーザーのWatchを解除できない", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    createdUserIds.push(owner.id, other.id);
    await prisma.serviceMaster.upsert({ where: { id: serviceId }, update: { status: "ACTIVE" }, create: { id: serviceId, slug: serviceId, name: "ChatGPT", category: "AI", officialUrl: "https://example.com", status: "ACTIVE" } });
    await prisma.serviceWatchlist.create({ data: { userId: owner.id, serviceId } });
    authState.user = other;
    expect((await DELETE(new Request("http://127.0.0.1:3100"), { params: Promise.resolve({ serviceId }) })).status).toBe(200);
    expect(await prisma.serviceWatchlist.count({ where: { userId: owner.id, serviceId } })).toBe(1);
  });
});
