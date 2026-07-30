import { prisma } from "@/lib/prisma";
import { DASHBOARD_ANNOUNCEMENT_MAX_ITEMS } from "@/lib/app-constants";
import { maintenanceModeKey } from "@/lib/admin-constants";

const maxAnnouncementLimit = DASHBOARD_ANNOUNCEMENT_MAX_ITEMS;
const minAnnouncementLimit = 1;

export type AnnouncementRecord = {
  id: string;
  title: string;
  body: string;
  published: boolean;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const defaultAnnouncement = {
  id: "default-admin-announcement",
  title: "管理者からのお知らせ",
  body: "メンテナンス情報や重要なお知らせは、このダッシュボード上部に表示されます。",
  pinned: true,
  published: true,
  createdAt: new Date("2026-07-26T00:00:00.000Z"),
  updatedAt: new Date("2026-07-26T00:00:00.000Z"),
};

function normalizeLimit(limit: number) {
  return Math.min(maxAnnouncementLimit, Math.max(minAnnouncementLimit, Math.trunc(limit)));
}

export async function getMaintenanceMode() {
  const settings = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT value FROM AppSetting WHERE \`key\` = ${maintenanceModeKey} LIMIT 1
  `;
  return settings[0]?.value === "enabled";
}

export async function setMaintenanceMode(enabled: boolean) {
  const value = enabled ? "enabled" : "disabled";
  await prisma.$executeRaw`
    INSERT INTO AppSetting (\`key\`, value, updatedAt)
    VALUES (${maintenanceModeKey}, ${value}, NOW(3))
    ON DUPLICATE KEY UPDATE value = ${value}, updatedAt = NOW(3)
  `;
}

export async function createAnnouncement(data: Pick<AnnouncementRecord, "title" | "body" | "published" | "pinned">) {
  await prisma.$executeRaw`
    INSERT INTO Announcement (id, title, body, published, pinned, createdAt, updatedAt)
    VALUES (UUID(), ${data.title}, ${data.body}, ${data.published}, ${data.pinned}, NOW(3), NOW(3))
  `;
}

export async function updateAnnouncementStatus(id: string, data: Pick<AnnouncementRecord, "published" | "pinned">) {
  await prisma.$executeRaw`
    UPDATE Announcement
    SET published = ${data.published}, pinned = ${data.pinned}, updatedAt = NOW(3)
    WHERE id = ${id}
  `;
}

export async function deleteAnnouncement(id: string) {
  await prisma.$executeRaw`DELETE FROM Announcement WHERE id = ${id}`;
}

export async function getAllAnnouncements() {
  return prisma.$queryRaw<AnnouncementRecord[]>`
    SELECT id, title, body, published, pinned, createdAt, updatedAt
    FROM Announcement
    ORDER BY pinned DESC, createdAt DESC
  `;
}

export async function getPublishedAnnouncements(limit = DASHBOARD_ANNOUNCEMENT_MAX_ITEMS) {
  const take = normalizeLimit(limit);
  const announcements = await prisma.$queryRaw<AnnouncementRecord[]>`
    SELECT id, title, body, published, pinned, createdAt, updatedAt
    FROM Announcement
    WHERE published = true
    ORDER BY pinned DESC, createdAt DESC
    LIMIT ${take}
  `;

  return announcements.length > 0 ? announcements : [defaultAnnouncement].slice(0, take);
}
