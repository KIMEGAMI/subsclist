import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const CLAIM_LEASE_MS = 30 * 60 * 1000;

export type NotificationDeliveryClaim = {
  id: string;
  claimToken: string;
};

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && error.code === "P2002",
  );
}

async function claimDelivery({
  create,
  find,
  reclaim,
}: {
  create: (claimToken: string, claimedAt: Date) => Promise<{ id: string }>;
  find: () => Promise<{ id: string; sentAt: Date | null; claimedAt: Date | null } | null>;
  reclaim: (claimId: string, claimToken: string, staleBefore: Date) => Promise<number>;
}): Promise<NotificationDeliveryClaim | null> {
  const claimedAt = new Date();
  const claimToken = randomUUID();
  try {
    const created = await create(claimToken, claimedAt);
    return { id: created.id, claimToken };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await find();
  if (!existing || existing.sentAt) return null;

  const staleBefore = new Date(claimedAt.getTime() - CLAIM_LEASE_MS);
  if (existing.claimedAt && existing.claimedAt >= staleBefore) return null;

  const reclaimed = await reclaim(existing.id, claimToken, staleBefore);
  return reclaimed === 1 ? { id: existing.id, claimToken } : null;
}

export function claimSubscriptionNotification(input: {
  userId: string;
  subscriptionId: string;
  type: string;
  scheduledFor: Date;
}) {
  return claimDelivery({
    create: (claimToken, claimedAt) => prisma.notificationDelivery.create({
      data: { ...input, sentAt: null, claimedAt, claimToken },
      select: { id: true, claimToken: true },
    }),
    find: () => prisma.notificationDelivery.findUnique({
      where: {
        subscriptionId_type_scheduledFor: {
          subscriptionId: input.subscriptionId,
          type: input.type,
          scheduledFor: input.scheduledFor,
        },
      },
      select: { id: true, claimToken: true, sentAt: true, claimedAt: true },
    }),
    reclaim: (claimId, claimToken, staleBefore) => prisma.notificationDelivery.updateMany({
      where: {
        id: claimId,
        sentAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
      },
      data: { claimToken, claimedAt: new Date() },
    }).then((result) => result.count),
  });
}

export function claimUserNotification(input: {
  userId: string;
  type: string;
  scheduledFor: Date;
}) {
  return claimDelivery({
    create: (claimToken, claimedAt) => prisma.userNotificationDelivery.create({
      data: { ...input, sentAt: null, claimedAt, claimToken },
      select: { id: true, claimToken: true },
    }),
    find: () => prisma.userNotificationDelivery.findUnique({
      where: {
        userId_type_scheduledFor: {
          userId: input.userId,
          type: input.type,
          scheduledFor: input.scheduledFor,
        },
      },
      select: { id: true, claimToken: true, sentAt: true, claimedAt: true },
    }),
    reclaim: (claimId, claimToken, staleBefore) => prisma.userNotificationDelivery.updateMany({
      where: {
        id: claimId,
        sentAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
      },
      data: { claimToken, claimedAt: new Date() },
    }).then((result) => result.count),
  });
}

export async function completeSubscriptionNotification(claim: NotificationDeliveryClaim) {
  const result = await prisma.notificationDelivery.updateMany({
    where: { id: claim.id, claimToken: claim.claimToken, sentAt: null },
    data: { sentAt: new Date(), claimToken: null, claimedAt: null },
  });
  if (result.count !== 1) throw new Error("Notification delivery claim was lost.");
}

export async function releaseSubscriptionNotification(claim: NotificationDeliveryClaim) {
  await prisma.notificationDelivery.updateMany({
    where: { id: claim.id, claimToken: claim.claimToken, sentAt: null },
    data: { claimToken: null, claimedAt: null },
  });
}

export async function completeUserNotification(claim: NotificationDeliveryClaim) {
  const result = await prisma.userNotificationDelivery.updateMany({
    where: { id: claim.id, claimToken: claim.claimToken, sentAt: null },
    data: { sentAt: new Date(), claimToken: null, claimedAt: null },
  });
  if (result.count !== 1) throw new Error("User notification delivery claim was lost.");
}

export async function releaseUserNotification(claim: NotificationDeliveryClaim) {
  await prisma.userNotificationDelivery.updateMany({
    where: { id: claim.id, claimToken: claim.claimToken, sentAt: null },
    data: { claimToken: null, claimedAt: null },
  });
}

export async function sendClaimedNotification({
  claim,
  send,
  complete,
  release,
}: {
  claim: NotificationDeliveryClaim;
  send: (idempotencyKey: string) => Promise<void>;
  complete: (claim: NotificationDeliveryClaim) => Promise<void>;
  release: (claim: NotificationDeliveryClaim) => Promise<void>;
}) {
  try {
    await send(`notification-${claim.id}`);
    await complete(claim);
  } catch (error) {
    await release(claim);
    throw error;
  }
}
