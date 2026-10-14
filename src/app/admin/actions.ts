"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import {
  createAnnouncement as createAnnouncementRecord,
  deleteAnnouncement as deleteAnnouncementRecord,
  setMaintenanceMode,
  updateAnnouncementStatus as updateAnnouncementStatusRecord,
} from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const titleMaxLength = 80;
const bodyMaxLength = 1000;
const recordIdMaxLength = 191;

const announcementSchema = z.object({
  title: z.string().trim().min(1, "タイトルを入力してください。").max(titleMaxLength, "タイトルは80文字以内で入力してください。"),
  body: z.string().trim().min(1, "本文を入力してください。").max(bodyMaxLength, "本文は1000文字以内で入力してください。"),
  published: z.boolean(),
  pinned: z.boolean(),
});

const idSchema = z
  .string()
  .trim()
  .min(1, "お知らせIDが指定されていません。")
  .max(recordIdMaxLength, "お知らせIDが不正です。");

const optionalPercentage = z.preprocess((value) => value === null || value === "" ? null : value, z.coerce.number().int().min(0).max(100).nullable());
const serviceAlternativeSchema = z.object({
  serviceId: z.string().trim().min(1).max(recordIdMaxLength),
  alternativeServiceId: z.string().trim().min(1).max(recordIdMaxLength),
  categoryMatch: optionalPercentage,
  featureSimilarity: optionalPercentage,
  note: z.string().trim().max(500).nullable(),
});

export async function createServiceAlternative(formData: FormData) {
  await requireAdminUser();
  const parsed = serviceAlternativeSchema.safeParse({
    serviceId: formData.get("serviceId"),
    alternativeServiceId: formData.get("alternativeServiceId"),
    categoryMatch: formData.get("categoryMatch") ? formData.get("categoryMatch") : null,
    featureSimilarity: formData.get("featureSimilarity") ? formData.get("featureSimilarity") : null,
    note: formData.get("note") ? formData.get("note") : null,
  });
  if (!parsed.success || parsed.data.serviceId === parsed.data.alternativeServiceId) throw new Error("異なるサービスを選択してください。");
  await prisma.serviceAlternative.upsert({
    where: { serviceId_alternativeServiceId: { serviceId: parsed.data.serviceId, alternativeServiceId: parsed.data.alternativeServiceId } },
    create: parsed.data,
    update: { categoryMatch: parsed.data.categoryMatch, featureSimilarity: parsed.data.featureSimilarity, note: parsed.data.note },
  });
  revalidatePath("/admin");
  revalidatePath(`/saas-watch/services/${parsed.data.serviceId}`);
}

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
  revalidatePath("/admin");
  revalidatePath("/");
}
