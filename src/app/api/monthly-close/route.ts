import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { nextBillingOccurrence } from "@/lib/billing";
import { reconcileBillingPeriod } from "@/lib/billing-reconciliation";
import { monthlyClosePeriod, summarizeMonthlyClose } from "@/lib/monthly-close";
import { calculateMonthlyCloseReadiness } from "@/lib/monthly-close-readiness";
import { summarizePaymentOrganization } from "@/lib/payment-organization";
import { isPremiumPlan } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { isRenewalDecisionDue, renewalDecisionPeriod } from "@/lib/renewal-decision";

export async function PUT() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan)) {
    return NextResponse.json(
      { message: "月次締めはPremium限定です。" },
      { status: 403 },
    );
  }

  const now = new Date();
  const period = monthlyClosePeriod(now);
  const monthlyClose = await prisma.$transaction(async (transaction) => {
    const decisionPeriod = renewalDecisionPeriod(now);
    const [subscriptions, payments, renewalDecisions] = await Promise.all([
      transaction.subscription.findMany({
        where: { userId: user.id, deletedAt: null, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          price: true,
          billingCycle: true,
          customCycleDays: true,
          nextBillingDate: true,
          lastReviewedAt: true,
          trialEndsAt: true,
          cancellationDeadline: true,
        },
      }),
      transaction.paymentHistory.findMany({
        where: {
          userId: user.id,
          paidAt: { gte: period.start, lt: period.end },
        },
        select: {
          id: true,
          subscriptionId: true,
          amount: true,
          businessUsePercent: true,
          paidAt: true,
          accountingLabel: true,
          referenceNumber: true,
          referenceUrl: true,
        },
      }),
      transaction.savingChallenge.findMany({
        where: {
          userId: user.id,
          year: decisionPeriod.year,
          month: decisionPeriod.month,
        },
        select: { subscriptionId: true },
      }),
    ]);
    const summary = summarizeMonthlyClose({ subscriptions, payments, now });
    const reconciliation = reconcileBillingPeriod({
      subscriptions,
      payments,
      rangeStart: period.start,
      rangeEnd: period.end,
      now,
    });
    const organization = summarizePaymentOrganization(payments);
    const renewalDecisionIds = new Set(
      renewalDecisions.map((decision) => decision.subscriptionId),
    );
    const renewalDecisionDueIds = subscriptions
      .filter((subscription) => isRenewalDecisionDue(
        nextBillingOccurrence(
          subscription.nextBillingDate,
          subscription.billingCycle,
          subscription.customCycleDays,
          now,
        ),
        now,
      ))
      .map((subscription) => subscription.id);
    const readiness = calculateMonthlyCloseReadiness({
      paidAsExpectedCount: reconciliation.summary.paidAsExpectedCount,
      amountMismatchCount: reconciliation.summary.amountMismatchCount,
      unconfirmedCount: reconciliation.summary.unconfirmedCount,
      unmatchedPaymentCount: reconciliation.summary.unmatchedPaymentCount,
      paymentCount: organization.totalCount,
      organizedPaymentCount: organization.organizedCount,
      renewalDecisionDueCount: renewalDecisionDueIds.length,
      renewalDecisionCompletedCount: renewalDecisionDueIds.filter((id) =>
        renewalDecisionIds.has(id)
      ).length,
    });

    return transaction.monthlyClose.upsert({
      where: {
        userId_year_month: {
          userId: user.id,
          year: summary.year,
          month: summary.month,
        },
      },
      create: {
        userId: user.id,
        year: summary.year,
        month: summary.month,
        paidAmount: summary.paidAmount,
        businessPaidAmount: summary.businessPaidAmount,
        activeMonthlyAmount: summary.activeMonthlyAmount,
        activeSubscriptionCount: summary.activeSubscriptionCount,
        reviewedSubscriptionCount: summary.reviewedSubscriptionCount,
        deadlineRiskCount: summary.deadlineRiskCount,
        readinessScore: readiness.score,
        unresolvedCount: readiness.unresolvedCount,
        reconciliationPercent: readiness.reconciliationPercent,
        organizationPercent: readiness.organizationPercent,
        renewalDecisionPercent: readiness.renewalDecisionPercent,
        completedAt: now,
      },
      update: {
        paidAmount: summary.paidAmount,
        businessPaidAmount: summary.businessPaidAmount,
        activeMonthlyAmount: summary.activeMonthlyAmount,
        activeSubscriptionCount: summary.activeSubscriptionCount,
        reviewedSubscriptionCount: summary.reviewedSubscriptionCount,
        deadlineRiskCount: summary.deadlineRiskCount,
        readinessScore: readiness.score,
        unresolvedCount: readiness.unresolvedCount,
        reconciliationPercent: readiness.reconciliationPercent,
        organizationPercent: readiness.organizationPercent,
        renewalDecisionPercent: readiness.renewalDecisionPercent,
        completedAt: now,
      },
    });
  });

  return NextResponse.json({
    completedAt: monthlyClose.completedAt.toISOString(),
    readinessScore: monthlyClose.readinessScore,
    unresolvedCount: monthlyClose.unresolvedCount,
  });
}
