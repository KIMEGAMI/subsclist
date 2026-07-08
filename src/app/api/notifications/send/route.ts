import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_NOTIFY_DAYS_BEFORE } from "@/lib/app-constants";
import { isoDate } from "@/lib/billing";
import { env } from "@/lib/env";
import { sendSubscriptionReminderEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

type Reminder = {
  type: "renewal" | "trial" | "cancellation";
  title: string;
  targetDate: Date;
  lines: string[];
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date: Date, days: number) {
  const value = startOfDay(date);
  value.setDate(value.getDate() + days);
  return value;
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function formatDate(date: Date) {
  return isoDate(date);
}
function hasPrismaErrorCode(error: unknown, code: string) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

function remindersFor(subscription: {
  name: string;
  price: number;
  currency: string;
  notifyDaysBefore: number | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
}) {
  const today = startOfDay(new Date());
  const daysBefore = subscription.notifyDaysBefore ?? DEFAULT_NOTIFY_DAYS_BEFORE;
  const reminders: Reminder[] = [];
  const price = `${subscription.currency} ${subscription.price.toLocaleString("ja-JP")}`;

  if (sameDay(addDays(today, daysBefore), subscription.nextBillingDate)) {
    reminders.push({
      type: "renewal",
      title: "更新日のお知らせ",
      targetDate: subscription.nextBillingDate,
      lines: [
        `${subscription.name} の次回更新日が近づいています。`,
        `更新日: ${formatDate(subscription.nextBillingDate)}`,
        `金額: ${price}`,
        "継続しない場合は、期限前に解約手続きを確認してください。",
      ],
    });
  }

  if (subscription.trialEndsAt && sameDay(addDays(today, daysBefore), subscription.trialEndsAt)) {
    reminders.push({
      type: "trial",
      title: "無料トライアル終了のお知らせ",
      targetDate: subscription.trialEndsAt,
      lines: [
        `${subscription.name} の無料トライアル終了日が近づいています。`,
        `終了日: ${formatDate(subscription.trialEndsAt)}`,
        "不要な場合は、初回課金前に解約手続きを確認してください。",
      ],
    });
  }

  if (subscription.cancellationDeadline && sameDay(addDays(today, daysBefore), subscription.cancellationDeadline)) {
    reminders.push({
      type: "cancellation",
      title: "解約期限のお知らせ",
      targetDate: subscription.cancellationDeadline,
      lines: [
        `${subscription.name} の解約期限が近づいています。`,
        `解約期限: ${formatDate(subscription.cancellationDeadline)}`,
        "継続しない場合は、期限までに解約してください。",
      ],
    });
  }

  return reminders;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const cronAuthorized = Boolean(env.notificationJobSecret && auth === `Bearer ${env.notificationJobSecret}`);
  const user = cronAuthorized ? null : await getCurrentUser();

  if (!cronAuthorized && !user) {
    return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  }
  if (!cronAuthorized && user && !user.emailVerified) {
    return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      userId: user?.id,
      user: { emailVerified: { not: null } },
    },
    include: { user: true },
  });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const subscription of subscriptions) {
    for (const reminder of remindersFor(subscription)) {
      const scheduledFor = startOfDay(reminder.targetDate);
      const delivered = await prisma.notificationDelivery.findFirst({
        where: {
          subscriptionId: subscription.id,
          type: reminder.type,
          scheduledFor,
        },
      });
      if (delivered) {
        skipped += 1;
        continue;
      }

      try {
        await sendSubscriptionReminderEmail({
          email: subscription.user.email,
          title: reminder.title,
          lines: reminder.lines,
        });
        await prisma.notificationDelivery.create({
          data: {
            userId: subscription.userId,
            subscriptionId: subscription.id,
            type: reminder.type,
            scheduledFor,
          },
        });
        sent += 1;
      } catch (error) {
        if (hasPrismaErrorCode(error, "P2002")) {
          skipped += 1;
          continue;
        }
        failures.push(subscription.name);
        console.error("Failed to send subscription reminder.", error);
      }
    }
  }

  return NextResponse.json({ ok: failures.length === 0, sent, skipped, failures });
}
