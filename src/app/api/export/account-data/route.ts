import { serializeAccountDataExport } from "@/lib/account-data-export";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const [
    profile,
    preference,
    categories,
    paymentMethods,
    subscriptions,
    statementMerchantAliases,
    statementPaymentImports,
    paymentHistories,
    priceHistories,
    usageRecords,
    weeklyUsageReviews,
    savingChallenges,
    monthlyCloses,
    cancellationChecklist,
    cancellationEvidences,
    notificationSettings,
    notificationDeliveries,
    userNotificationDeliveries,
    loginSecurityEvents,
    geminiAnalysisRequests,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, emailVerified: true, lastLoginAt: true, plan: true, stripeSubscriptionStatus: true, stripeTrialStartAt: true, stripeTrialEndAt: true, trialUsedAt: true, stripeCurrentPeriodEnd: true, stripeCancelAt: true, stripeCancelAtPeriodEnd: true, createdAt: true, updatedAt: true } }),
    prisma.userPreference.findUnique({ where: { userId: user.id }, select: { monthlyBudget: true, defaultNotifyDaysBefore: true, notificationHour: true, monthlyDigestEnabled: true, createdAt: true, updatedAt: true } }),
    prisma.category.findMany({ where: { userId: user.id }, select: { id: true, name: true, color: true, createdAt: true, updatedAt: true }, orderBy: { name: "asc" } }),
    prisma.paymentMethod.findMany({ where: { userId: user.id }, select: { id: true, name: true, type: true, memo: true, createdAt: true, updatedAt: true }, orderBy: { name: "asc" } }),
    prisma.subscription.findMany({ where: { userId: user.id }, select: { id: true, categoryId: true, paymentMethodId: true, billingProvider: true, name: true, price: true, scheduledPrice: true, scheduledPriceAt: true, currency: true, sourceAmountMinor: true, exchangeRateToJpyScaled: true, exchangeRateUpdatedAt: true, billingCycle: true, customCycleDays: true, nextBillingDate: true, status: true, memo: true, serviceUrl: true, cancellationUrl: true, trialEndsAt: true, cancellationDeadline: true, lastReviewedAt: true, notifyDaysBefore: true, notificationSnoozedUntil: true, usageFrequency: true, priority: true, businessUsePercent: true, defaultAccountingLabel: true, logoUrl: true, cancellationStatus: true, plannedCancelAt: true, cancellationMemo: true, cancellationCompletedAt: true, createdAt: true, updatedAt: true, deletedAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.statementMerchantAlias.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, merchantLabel: true, normalizedMerchant: true, createdAt: true, updatedAt: true }, orderBy: [{ subscriptionId: "asc" }, { createdAt: "asc" }] }),
    prisma.statementPaymentImport.findMany({ where: { userId: user.id }, select: { id: true, importedCount: true, savedAliasCount: true, undoneAt: true, undoneCount: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.paymentHistory.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, statementPaymentImportId: true, amount: true, paidAt: true, businessUsePercent: true, subscriptionNameSnapshot: true, categoryNameSnapshot: true, paymentMethodNameSnapshot: true, accountingLabel: true, referenceNumber: true, referenceUrl: true, memo: true, createdAt: true }, orderBy: [{ paidAt: "asc" }, { id: "asc" }] }),
    prisma.subscriptionPriceHistory.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, price: true, billingCycle: true, customCycleDays: true, effectiveFrom: true, createdAt: true }, orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }] }),
    prisma.subscriptionUsage.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, usedDate: true, usageCount: true, createdAt: true, updatedAt: true }, orderBy: [{ usedDate: "asc" }, { id: "asc" }] }),
    prisma.weeklyUsageReview.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, weekStart: true, usageRange: true, createdAt: true, updatedAt: true }, orderBy: [{ weekStart: "asc" }, { id: "asc" }] }),
    prisma.savingChallenge.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, year: true, month: true, status: true, potentialMonthlySaving: true, reason: true, renewalDate: true, decidedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ decidedAt: "asc" }, { id: "asc" }] }),
    prisma.monthlyClose.findMany({ where: { userId: user.id }, select: { id: true, year: true, month: true, paidAmount: true, businessPaidAmount: true, activeMonthlyAmount: true, activeSubscriptionCount: true, reviewedSubscriptionCount: true, deadlineRiskCount: true, readinessScore: true, unresolvedCount: true, reconciliationPercent: true, organizationPercent: true, renewalDecisionPercent: true, completedAt: true, updatedAt: true }, orderBy: [{ year: "asc" }, { month: "asc" }] }),
    prisma.cancellationChecklistItem.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, label: true, sortOrder: true, completedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ subscriptionId: "asc" }, { sortOrder: "asc" }] }),
    prisma.cancellationEvidence.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, title: true, kind: true, referenceUrl: true, memo: true, recordedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] }),
    prisma.notificationSetting.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, daysBefore: true, enabled: true, createdAt: true, updatedAt: true }, orderBy: [{ subscriptionId: "asc" }, { daysBefore: "asc" }] }),
    prisma.notificationDelivery.findMany({ where: { userId: user.id }, select: { id: true, subscriptionId: true, type: true, scheduledFor: true, sentAt: true }, orderBy: [{ sentAt: "asc" }, { id: "asc" }] }),
    prisma.userNotificationDelivery.findMany({ where: { userId: user.id }, select: { id: true, type: true, scheduledFor: true, sentAt: true }, orderBy: [{ sentAt: "asc" }, { id: "asc" }] }),
    prisma.loginSecurityEvent.findMany({ where: { userId: user.id }, select: { id: true, type: true, clientLabel: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.geminiAnalysisRequest.findMany({ where: { userId: user.id }, select: { id: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);

  if (!profile) return Response.json({ message: "アカウントが見つかりません。" }, { status: 404 });
  const exportedAt = new Date();
  const json = serializeAccountDataExport({ profile, preference, categories, paymentMethods, subscriptions, statementMerchantAliases, statementPaymentImports, paymentHistories, priceHistories, usageRecords, weeklyUsageReviews, savingChallenges, monthlyCloses, cancellationChecklist, cancellationEvidences, notificationSettings, notificationDeliveries, userNotificationDeliveries, loginSecurityEvents, geminiAnalysisRequests }, exportedAt);
  return new Response(json, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="subsclist-account-data-${exportedAt.toISOString().slice(0, 10)}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
