"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import {
  createAnnouncement as createAnnouncementRecord,
  deleteAnnouncement as deleteAnnouncementRecord,
  setMaintenanceMode,
  updateAnnouncementStatus as updateAnnouncementStatusRecord,
} from "@/lib/admin";
import { maintenanceModeCookie } from "@/lib/admin-constants";

const titleMaxLength = 80;
const bodyMaxLength = 1000;

const announcementSchema = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください。").max(titleMaxLength, "タイトルは80文字以内で入力してください。"),
  body: z.string().trim().min(1, "本文を入力してください。").max(bodyMaxLength, "本文は1000文字以内で入力してください。"),
  published: z.boolean(),
  pinned: z.boolean(),
});

const idSchema = z.string().min(1);

export async function createAnnouncement(formData: FormData) {
  await requireAdminUser();

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    published: formData.get("published") === "on",
    pinned: formData.get("pinned") === "on",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "お知らせの保存に失敗しました。");
  }

  await createAnnouncementRecord(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function updateAnnouncementStatus(formData: FormData) {
  await requireAdminUser();

  const id = idSchema.parse(String(formData.get("id") ?? ""));
  await updateAnnouncementStatusRecord(id, {
    published: formData.get("published") === "on",
    pinned: formData.get("pinned") === "on",
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function deleteAnnouncement(formData: FormData) {
  await requireAdminUser();

  const id = idSchema.parse(String(formData.get("id") ?? ""));
  await deleteAnnouncementRecord(id);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

export async function updateMaintenanceMode(formData: FormData) {
  await requireAdminUser();

  const enabled = formData.get("mode") === "enabled";
  await setMaintenanceMode(enabled);
  const cookieStore = await cookies();
  cookieStore.set(maintenanceModeCookie, enabled ? "enabled" : "disabled", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/admin");
  revalidatePath("/");
}
