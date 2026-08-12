import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_NOTIFY_DAYS_BEFORE } from "@/lib/app-constants";
import { isoDate, MONTHS_PER_YEAR, monthlyAmount } from "@/lib/billing";
import { priceIncreaseRegisteredToday, unusedNotificationMilestone } from "@/lib/engagement-notifications";
import { env } from "@/lib/env";
import { sendSubscriptionReminderEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";
import { detectCancellationCandidates } from "@/lib/subscription-cancellation-candidates";
import { needsWeeklyReview, startOfJapanWeek } from "@/lib/subscription-weekly-review";
import { japanCalendarDate, shiftCalendarDays } from "@/lib/subscription-usage";
import { shouldRunNotificationAtHour } from "@/lib/notification-schedule";

type Reminder = {
  type: "renewal" | "trial" | "cancellation" | "weekly_review" | "unused_30" | "unused_60" | "unused_90" | "price_increase";
  title: string;
  targetDate: Date;
  lines: string[];
};

function startOfDay(date: Date) {
  return japanCalendarDate(date);
}

function addDays(date: Date, days: number) {
  return shiftCalendarDays(startOfDay(date), days);
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
  createdAt: Date;
  plan: string;
  price: number;
  currency: string;
  billingCycle: string;
  customCycleDays: number | null;
  notifyDaysBefore: number | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
  lastReviewedAt: Date | null;
  usageFrequency: string;
  usageRecords: Array<{ usedDate: Date }>;
  priceHistories: Array<{
    price: number;
    billingCycle: string;
    customCycleDays: number | null;
    effectiveFrom: Date;
  }>;
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

  if (subscription.usageFrequency !== "UNKNOWN" && needsWeeklyReview({ lastReviewedAt: subscription.lastReviewedAt, usedDates: subscription.usageRecords.map((record) => record.usedDate) })) {
    reminders.push({
      type: "weekly_review",
      title: "今週の利用確認",
      targetDate: startOfJapanWeek(),
      lines: [
        `${subscription.name} は過去7日に利用記録と見直し記録がありません。`,
        "継続する場合は利用状況を確認し、不要であれば見直し候補として検討してください。",
      ],
    });
  }

  if (isPremiumPlan(subscription.plan)) {
    const unusedMilestone = unusedNotificationMilestone({
      createdAt: subscription.createdAt,
      lastUsedAt: subscription.usageRecords[0]?.usedDate,
    });
    if (unusedMilestone) {
      reminders.push({
        type: `unused_${unusedMilestone.days}`,
        title: `${unusedMilestone.days}日間未使用のお知らせ`,
        targetDate: unusedMilestone.targetDate,
        lines: [
          `${subscription.name} は${unusedMilestone.days}日以上、利用記録がありません。`,
          `月額換算: ${Math.round(monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays)).toLocaleString("ja-JP")}円`,
          "継続する価値があるか、SubscListで利用状況を見直してください。",
        ],
      });
    }

    const previousPrice = subscription.priceHistories[0];
    const increase = previousPrice ? priceIncreaseRegisteredToday({
      currentPrice: subscription.price,
      currentBillingCycle: subscription.billingCycle,
      currentCustomCycleDays: subscription.customCycleDays,
      previousPrice: previousPrice.price,
      previousBillingCycle: previousPrice.billingCycle,
      previousCustomCycleDays: previousPrice.customCycleDays,
      effectiveFrom: previousPrice.effectiveFrom,
    }) : null;
    if (increase) {
      reminders.push({
        type: "price_increase",
        title: "値上げ登録のお知らせ",
        targetDate: previousPrice.effectiveFrom,
        lines: [
          `${subscription.name} の月額換算額が上がりました。`,
          `変更前: 約${Math.round(increase.previousMonthly).toLocaleString("ja-JP")}円`,
          `変更後: 約${Math.round(increase.currentMonthly).toLocaleString("ja-JP")}円`,
          `月額換算の増加: 約${Math.round(increase.increase).toLocaleString("ja-JP")}円`,
        ],
      });
    }
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
    include: {
      user: { include: { preference: true } },
      usageRecords: {
        orderBy: { usedDate: "desc" },
        take: 1,
        select: { usedDate: true },
      },
      priceHistories: {
        orderBy: { effectiveFrom: "desc" },
        take: 1,
        select: { price: true, billingCycle: true, customCycleDays: true, effectiveFrom: true },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  const subscriptionsByUser = new Map<string, Array<(typeof subscriptions)[number]>>();

  for (const subscription of subscriptions) {
    const userSubscriptions = subscriptionsByUser.get(subscription.userId) ?? [];
    userSubscriptions.push(subscription);
    subscriptionsByUser.set(subscription.userId, userSubscriptions);
    if (cronAuthorized && !shouldRunNotificationAtHour(subscription.user.preference?.notificationHour)) {
      continue;
    }
    for (const reminder of remindersFor({ ...subscription, plan: subscription.user.plan })) {
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
        console.error("Failed to send subscription reminder.");
      }
    }
  }

  const budgetNotificationDate = startOfDay(new Date());
  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const preference = userSubscriptions[0]?.user.preference;
    if (!preference || preference.monthlyBudget === null) continue;
    const monthlyBudget = preference.monthlyBudget;
    if (cronAuthorized && !shouldRunNotificationAtHour(preference.notificationHour)) continue;

    const monthlyTotal = userSubscriptions.reduce(
      (total, subscription) => total + monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays),
      0,
    );
    if (monthlyTotal <= monthlyBudget) continue;

    const alreadySent = await prisma.userNotificationDelivery.findFirst({
      where: { userId, type: "budget_overrun", scheduledFor: budgetNotificationDate },
    });
    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      await sendSubscriptionReminderEmail({
        email: userSubscriptions[0].user.email,
        title: "月額予算の超過",
        lines: [
          `月額換算の合計 ${Math.round(monthlyTotal).toLocaleString("ja-JP")}円 が、設定した予算 ${monthlyBudget.toLocaleString("ja-JP")}円 を超えています。`,
          `超過額: ${Math.round(monthlyTotal - monthlyBudget).toLocaleString("ja-JP")}円`,
          "SubscListのダッシュボードで、利用頻度や見直し候補を確認してください。",
        ],
      });
      await prisma.userNotificationDelivery.create({
        data: { userId, type: "budget_overrun", scheduledFor: budgetNotificationDate },
      });
      sent += 1;
    } catch (error) {
      if (hasPrismaErrorCode(error, "P2002")) {
        skipped += 1;
        continue;
      }
      failures.push("月額予算");
      console.error("Failed to send budget overrun notification.");
    }
  }

  const today = startOfDay(new Date());
  const challengeYear = today.getUTCFullYear();
  const challengeMonth = today.getUTCMonth() + 1;
  const challengeNotificationDate = new Date(Date.UTC(challengeYear, challengeMonth - 1, 1));
  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const notificationUser = userSubscriptions[0]?.user;
    if (!notificationUser || !isPremiumPlan(notificationUser.plan)) continue;
    if (cronAuthorized && !shouldRunNotificationAtHour(notificationUser.preference?.notificationHour)) continue;

    const answered = await prisma.savingChallenge.findUnique({
      where: { userId_year_month: { userId, year: challengeYear, month: challengeMonth } },
      select: { id: true },
    });
    if (answered) continue;

    const candidate = monthlyChallengeCandidate(userSubscriptions);
    if (!candidate) continue;

    const alreadySent = await prisma.userNotificationDelivery.findFirst({
      where: { userId, type: "monthly_saving_challenge", scheduledFor: challengeNotificationDate },
    });
    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      await sendSubscriptionReminderEmail({
        email: notificationUser.email,
        title: `${challengeMonth}月の削減チャレンジ`,
        lines: [
          `${candidate.name} を今月の見直し候補として確認してください。`,
          `月額換算: 約${Math.round(candidate.monthlyCost).toLocaleString("ja-JP")}円`,
          `年間の削減余地: 約${Math.round(candidate.annualSaving).toLocaleString("ja-JP")}円`,
          `理由: ${candidate.reasons.join(" / ")}`,
          "自動解約は行いません。SubscListで継続・解約予定・保留を選択してください。",
        ],
      });
      await prisma.userNotificationDelivery.create({
        data: { userId, type: "monthly_saving_challenge", scheduledFor: challengeNotificationDate },
      });
      sent += 1;
    } catch (error) {
      if (hasPrismaErrorCode(error, "P2002")) {
        skipped += 1;
        continue;
      }
      failures.push("月次削減チャレンジ");
      console.error("Failed to send monthly saving challenge notification.");
    }
  }

  return NextResponse.json({ ok: failures.length === 0, sent, skipped, failures });
}

function monthlyChallengeCandidate(subscriptions: Array<{
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  categoryId: string | null;
  usageFrequency: string;
  priority: string;
  createdAt: Date;
  usageRecords: Array<{ usedDate: Date }>;
}>) {
  const categoryCounts = subscriptions.reduce<Map<string, number>>((counts, subscription) => {
    if (!subscription.categoryId) return counts;
    counts.set(subscription.categoryId, (counts.get(subscription.categoryId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const highestMonthlyCost = subscriptions.reduce(
    (highest, subscription) => Math.max(highest, monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays)),
    0,
  );

  return detectCancellationCandidates(subscriptions.map((subscription) => ({
    id: subscription.id,
    name: subscription.name,
    monthlyCost: monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays),
    unusedDays: unusedNotificationMilestone({
      createdAt: subscription.createdAt,
      lastUsedAt: subscription.usageRecords[0]?.usedDate,
    })?.days ?? 0,
    usageFrequency: subscription.usageFrequency,
    priority: subscription.priority,
    duplicateCategory: Boolean(subscription.categoryId && (categoryCounts.get(subscription.categoryId) ?? 0) > 1),
    isHighCost: highestMonthlyCost > 0
      && monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays) === highestMonthlyCost,
  })), MONTHS_PER_YEAR)[0] ?? null;
}
