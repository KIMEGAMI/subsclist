import { afterEach, describe, expect, it, vi } from "vitest";

const adminMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
  createAnnouncement: vi.fn(async () => undefined),
  updateAnnouncement: vi.fn(async () => undefined),
  deleteAnnouncement: vi.fn(async () => undefined),
  setMaintenance: vi.fn(async () => undefined),
  cookieSet: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdminUser: adminMocks.requireAdmin }));
vi.mock("@/lib/admin", () => ({
  createAnnouncement: adminMocks.createAnnouncement,
  updateAnnouncementStatus: adminMocks.updateAnnouncement,
  deleteAnnouncement: adminMocks.deleteAnnouncement,
  setMaintenanceMode: adminMocks.setMaintenance,
}));
vi.mock("next/cache", () => ({ revalidatePath: adminMocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: adminMocks.cookieSet }),
}));

import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncementStatus,
  updateMaintenanceMode,
} from "@/app/admin/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

afterEach(() => {
  vi.clearAllMocks();
  adminMocks.requireAdmin.mockResolvedValue(undefined);
});

describe("管理者操作の認可", () => {
  it.each([
    ["お知らせ作成", () => createAnnouncement(form({ title: "告知", body: "本文" })), adminMocks.createAnnouncement],
    ["状態更新", () => updateAnnouncementStatus(form({ id: "announcement-id" })), adminMocks.updateAnnouncement],
    ["削除", () => deleteAnnouncement(form({ id: "announcement-id" })), adminMocks.deleteAnnouncement],
    ["メンテナンス切替", () => updateMaintenanceMode(form({ mode: "enabled" })), adminMocks.setMaintenance],
  ])("一般ユーザーによる%sを保存前に拒否する", async (_label, action, storageMock) => {
    adminMocks.requireAdmin.mockRejectedValueOnce(new Error("管理者権限が必要です。"));
    await expect(action()).rejects.toThrow("管理者権限が必要です。");
    expect(storageMock).not.toHaveBeenCalled();
  });
});

describe("管理者のお知らせ操作", () => {
  it("前後空白を除去し、公開・固定状態を保存して表示を更新する", async () => {
    await createAnnouncement(form({
      title: "  メンテナンス予定  ",
      body: "  9月2日に実施します。  ",
      published: "on",
      pinned: "on",
    }));

    expect(adminMocks.createAnnouncement).toHaveBeenCalledWith({
      title: "メンテナンス予定",
      body: "9月2日に実施します。",
      published: true,
      pinned: true,
    });
    expect(adminMocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(adminMocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it.each([
    ["空のタイトル", { title: "   ", body: "本文" }, "タイトルを入力してください。"],
    ["長すぎる本文", { title: "告知", body: "あ".repeat(1001) }, "本文は1000文字以内で入力してください。"],
  ])("%sをDB保存前に拒否する", async (_label, values, message) => {
    await expect(createAnnouncement(form(values))).rejects.toThrow(message);
    expect(adminMocks.createAnnouncement).not.toHaveBeenCalled();
  });

  it("公開・固定状態を更新する", async () => {
    await updateAnnouncementStatus(form({ id: "  announcement-id  ", published: "on" }));
    expect(adminMocks.updateAnnouncement).toHaveBeenCalledWith("announcement-id", {
      published: true,
      pinned: false,
    });
  });

  it.each(["", "x".repeat(192)])("不正なお知らせIDを拒否する", async (id) => {
    await expect(deleteAnnouncement(form({ id }))).rejects.toThrow();
    expect(adminMocks.deleteAnnouncement).not.toHaveBeenCalled();
  });
});

describe("メンテナンスモード", () => {
  it.each([
    ["enabled", true, "enabled"],
    ["disabled", false, "disabled"],
  ])("%sへ切り替えて管理者Cookieを同期する", async (mode, enabled, cookieValue) => {
    await updateMaintenanceMode(form({ mode }));
    expect(adminMocks.setMaintenance).toHaveBeenCalledWith(enabled);
    expect(adminMocks.cookieSet).toHaveBeenCalledWith(
      expect.any(String),
      cookieValue,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(adminMocks.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(adminMocks.revalidatePath).toHaveBeenCalledWith("/");
  });
});
