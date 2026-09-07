import { NextRequest, NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { DEFAULT_NOTIFY_DAYS_BEFORE } from "@/lib/app-constants";
import { isoDate, MONTHS_PER_YEAR, monthlyAmount, nextBillingOccurrence } from "@/lib/billing";
import { priceIncreaseRegisteredToday, unusedNotificationMilestone } from "@/lib/engagement-notifications";
import { env } from "@/lib/env";
import { sendSubscriptionReminderEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";
import { detectCancellationCandidates } from "@/lib/subscription-cancellation-candidates";
import { needsWeeklyReview, startOfJapanWeek } from "@/lib/subscription-weekly-review";
import { japanCalendarDate, shiftCalendarDays } from "@/lib/subscription-usage";
import { shouldRunNotificationAtHour } from "@/lib/notification-schedule";
import {
  NOTIFICATION_JOB_STATUS_KEY,
  serializeNotificationJobStatus,
} from "@/lib/notification-job-status";
import { effectiveSubscriptionNotification } from "@/lib/subscription-notification";
import {
  isMonthlyDigestDay,
  previousMonthlyOutcomePeriod,
  previousMonthlyOutcomeSummaryLines,
  summarizeMonthlyDigest,
  summarizePreviousMonthlyOutcome,
} from "@/lib/monthly-digest";
import { isSubscriptionNotificationSnoozed } from "@/lib/notification-snooze";
import { scheduledPriceNoticeDue } from "@/lib/scheduled-price";
import {
  formatSourceAmountMinor,
  isSubscriptionCurrency,
} from "@/lib/subscription-currency";

type Reminder = {
  type: "renewal" | "trial" | "cancellation" | "weekly_review" | "unused_30" | "unused_60" | "unused_90" | "price_increase" | "scheduled_price_change";
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

async function saveNotificationJobStatus(value: string) {
  await prisma.appSetting.upsert({
    where: { key: NOTIFICATION_JOB_STATUS_KEY },
    create: { key: NOTIFICATION_JOB_STATUS_KEY, value },
    update: { value },
  });
}

function remindersFor(subscription: {
  name: string;
  createdAt: Date;
  plan: string;
  price: number;
  scheduledPrice: number | null;
  scheduledPriceAt: Date | null;
  currency: string;
  sourceAmountMinor: number | null;
  billingCycle: string;
  customCycleDays: number | null;
  notificationDaysBefore: number;
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
  const daysBefore = subscription.notificationDaysBefore;
  const reminders: Reminder[] = [];
  const price = `${subscription.price.toLocaleString("ja-JP")}円`;
  const originalPrice =
    isSubscriptionCurrency(subscription.currency)
    && subscription.currency !== "JPY"
    && subscription.sourceAmountMinor !== null
      ? `${subscription.currency} ${formatSourceAmountMinor(subscription.sourceAmountMinor, subscription.currency)}`
      : null;
  const renewalDate = nextBillingOccurrence(
    subscription.nextBillingDate,
    subscription.billingCycle,
    subscription.customCycleDays,
    today,
  );

  if (sameDay(addDays(today, daysBefore), renewalDate)) {
    reminders.push({
      type: "renewal",
      title: "更新日のお知らせ",
      targetDate: renewalDate,
      lines: [
        `${subscription.name} の次回更新日が近づいています。`,
        `更新日: ${formatDate(renewalDate)}`,
        `金額（円換算）: ${price}`,
        ...(originalPrice ? [`原通貨の請求額: ${originalPrice}`] : []),
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

  if (
    subscription.scheduledPrice !== null
    && subscription.scheduledPriceAt
    && scheduledPriceNoticeDue(subscription.scheduledPriceAt, daysBefore)
  ) {
    const difference = subscription.scheduledPrice - subscription.price;
    reminders.push({
      type: "scheduled_price_change",
      title: "価格変更予定のお知らせ",
      targetDate: subscription.scheduledPriceAt,
      lines: [
        `${subscription.name} に価格変更予定が登録されています。`,
        `変更予定日: ${formatDate(subscription.scheduledPriceAt)}`,
        `現在: ${subscription.price.toLocaleString("ja-JP")}円`,
        `変更後: ${subscription.scheduledPrice.toLocaleString("ja-JP")}円`,
        `差額: ${difference >= 0 ? "+" : ""}${difference.toLocaleString("ja-JP")}円`,
        "請求条件を確認し、SubscListの契約詳細から現在価格へ反映してください。",
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
    const lastUsedAt = subscription.usageRecords[0]?.usedDate;
    const unusedMilestone = lastUsedAt ? unusedNotificationMilestone({
      createdAt: subscription.createdAt,
      lastUsedAt,
    }) : null;
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
  const access = cronAuthorized ? null : await getVerifiedApiUser();
  if (access && !access.ok) return access.response;
  const user = access?.ok ? access.user : null;
  const jobStartedAt = new Date();
  if (cronAuthorized) {
    await saveNotificationJobStatus(serializeNotificationJobStatus({
      state: "RUNNING",
      startedAt: jobStartedAt.toISOString(),
      completedAt: null,
      sent: 0,
      skipped: 0,
      failures: 0,
    }));
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
      notificationSettings: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { enabled: true, daysBefore: true },
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
    const notification = effectiveSubscriptionNotification({
      settings: subscription.notificationSettings,
      subscriptionDaysBefore: subscription.notifyDaysBefore,
      fallbackDaysBefore:
        subscription.user.preference?.defaultNotifyDaysBefore
        ?? DEFAULT_NOTIFY_DAYS_BEFORE,
    });
    if (!notification.enabled) continue;
    if (isSubscriptionNotificationSnoozed(subscription.notificationSnoozedUntil)) continue;
    for (const reminder of remindersFor({
      ...subscription,
      plan: subscription.user.plan,
      notificationDaysBefore: notification.daysBefore,
    })) {
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
  if (isMonthlyDigestDay(today)) {
    const digestUsers = (await prisma.user.findMany({
      where: { id: user?.id, emailVerified: { not: null } },
      include: { preference: true },
    })).filter((notificationUser) =>
      isPremiumPlan(notificationUser.plan)
      && notificationUser.preference?.monthlyDigestEnabled !== false
    );
    const digestUserIds = digestUsers.map((notificationUser) => notificationUser.id);
    const outcomePeriod = previousMonthlyOutcomePeriod(today);
    const [outcomePayments, outcomeCloses, outcomeDecisions, outcomeCancellations] = digestUserIds.length > 0
      ? await Promise.all([
          prisma.paymentHistory.findMany({
            where: { userId: { in: digestUserIds }, paidAt: { gte: outcomePeriod.start, lt: outcomePeriod.end } },
            select: { userId: true, amount: true, businessUsePercent: true, paidAt: true },
          }),
          prisma.monthlyClose.findMany({
            where: { userId: { in: digestUserIds }, year: outcomePeriod.year, month: outcomePeriod.month },
            select: { userId: true, year: true, month: true, readinessScore: true, unresolvedCount: true },
          }),
          prisma.savingChallenge.findMany({
            where: { userId: { in: digestUserIds }, decidedAt: { gte: outcomePeriod.start, lt: outcomePeriod.end } },
            select: { userId: true, decidedAt: true },
          }),
          prisma.subscription.findMany({
            where: {
              userId: { in: digestUserIds },
              cancellationStatus: "COMPLETED",
              cancellationCompletedAt: { gte: outcomePeriod.start, lt: outcomePeriod.end },
            },
            select: { userId: true, price: true, billingCycle: true, customCycleDays: true, cancellationCompletedAt: true },
          }),
        ])
      : [[], [], [], []];
    const paymentsByUser = new Map<string, typeof outcomePayments>();
    const decisionsByUser = new Map<string, typeof outcomeDecisions>();
    const cancellationsByUser = new Map<string, typeof outcomeCancellations>();
    const closeByUser = new Map(outcomeCloses.map((close) => [close.userId, close]));
    for (const payment of outcomePayments) {
      paymentsByUser.set(payment.userId, [...(paymentsByUser.get(payment.userId) ?? []), payment]);
    }
    for (const decision of outcomeDecisions) {
      decisionsByUser.set(decision.userId, [...(decisionsByUser.get(decision.userId) ?? []), decision]);
    }
    for (const cancellation of outcomeCancellations) {
      cancellationsByUser.set(cancellation.userId, [
        ...(cancellationsByUser.get(cancellation.userId) ?? []),
        cancellation,
      ]);
    }

    for (const notificationUser of digestUsers) {
      const userId = notificationUser.id;
      const userSubscriptions = subscriptionsByUser.get(userId) ?? [];
      if (cronAuthorized && !shouldRunNotificationAtHour(notificationUser.preference?.notificationHour)) continue;

      const alreadySent = await prisma.userNotificationDelivery.findFirst({
        where: { userId, type: "monthly_portfolio_digest", scheduledFor: challengeNotificationDate },
      });
      if (alreadySent) {
        skipped += 1;
        continue;
      }

      const digest = summarizeMonthlyDigest({
        subscriptions: userSubscriptions,
        monthlyBudget: notificationUser.preference?.monthlyBudget ?? null,
        referenceDate: today,
      });
      const budgetLine = digest.budgetDifference === null
        ? "月額予算: 未設定"
        : digest.budgetDifference >= 0
          ? `月額予算の残り: ${digest.budgetDifference.toLocaleString("ja-JP")}円`
          : `月額予算の超過: ${Math.abs(digest.budgetDifference).toLocaleString("ja-JP")}円`;
      const highestCostLine = digest.highestCostSubscription
        ? `月額換算が最大の契約: ${digest.highestCostSubscription.name} ${digest.highestCostSubscription.monthlyAmount.toLocaleString("ja-JP")}円`
        : "登録中の契約はありません。";
      const outcome = summarizePreviousMonthlyOutcome({
        payments: paymentsByUser.get(userId) ?? [],
        decisions: decisionsByUser.get(userId) ?? [],
        cancellations: cancellationsByUser.get(userId) ?? [],
        monthlyClose: closeByUser.get(userId) ?? null,
        referenceDate: today,
      });

      try {
        await sendSubscriptionReminderEmail({
          email: notificationUser.email,
          title: `${challengeMonth}月のサブスク運用サマリー`,
          lines: [
            ...previousMonthlyOutcomeSummaryLines(outcome),
            `有効な契約: ${digest.activeCount}件 / 月額見込み: ${digest.monthlyTotal.toLocaleString("ja-JP")}円`,
            `仕事利用分の見込み: ${digest.businessMonthlyTotal.toLocaleString("ja-JP")}円`,
            budgetLine,
            `30日以内の更新: ${digest.upcomingRenewalCount}件 / 30日以上未見直し: ${digest.reviewNeededCount}件`,
            highestCostLine,
            `前月レポート: ${new URL(`/monthly-report?month=${outcome.year}-${String(outcome.month).padStart(2, "0")}`, env.appUrl).toString()}`,
            `今月の確認: ${new URL("/monthly-report", env.appUrl).toString()}`,
          ],
        });
        await prisma.userNotificationDelivery.create({
          data: { userId, type: "monthly_portfolio_digest", scheduledFor: challengeNotificationDate },
        });
        sent += 1;
      } catch (error) {
        if (hasPrismaErrorCode(error, "P2002")) {
          skipped += 1;
          continue;
        }
        failures.push("月次運用サマリー");
        console.error("Failed to send monthly portfolio digest.");
      }
    }
  }

  for (const [userId, userSubscriptions] of subscriptionsByUser) {
    const notificationUser = userSubscriptions[0]?.user;
    if (!notificationUser || !isPremiumPlan(notificationUser.plan)) continue;
    if (cronAuthorized && !shouldRunNotificationAtHour(notificationUser.preference?.notificationHour)) continue;

    const candidate = monthlyChallengeCandidate(userSubscriptions);
    if (!candidate) continue;

    const answered = await prisma.savingChallenge.findUnique({
      where: {
        userId_subscriptionId_year_month: {
          userId,
          subscriptionId: candidate.id,
          year: challengeYear,
          month: challengeMonth,
        },
      },
      select: { id: true },
    });
    if (answered) continue;

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
          `確度補正後の年間試算: 約${Math.round(candidate.annualSaving).toLocaleString("ja-JP")}円（確度 ${candidate.confidencePercent}%）`,
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

  if (cronAuthorized) {
    await saveNotificationJobStatus(serializeNotificationJobStatus({
      state: failures.length === 0 ? "SUCCEEDED" : "PARTIAL",
      startedAt: jobStartedAt.toISOString(),
      completedAt: new Date().toISOString(),
      sent,
      skipped,
      failures: failures.length,
    }));
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
    unusedDays: subscription.usageRecords[0]?.usedDate ? unusedNotificationMilestone({
      createdAt: subscription.createdAt,
      lastUsedAt: subscription.usageRecords[0].usedDate,
    })?.days ?? 0 : 0,
    usageFrequency: subscription.usageFrequency,
    priority: subscription.priority,
    duplicateCategory: Boolean(subscription.categoryId && (categoryCounts.get(subscription.categoryId) ?? 0) > 1),
    isHighCost: highestMonthlyCost > 0
      && monthlyAmount(subscription.price, subscription.billingCycle, subscription.customCycleDays) === highestMonthlyCost,
  })), MONTHS_PER_YEAR)[0] ?? null;
}
