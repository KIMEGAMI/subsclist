import {
  DAYS_PER_WEEK,
  isoDate,
  MILLISECONDS_PER_DAY,
  nextBillingOccurrence,
} from "./billing.ts";

export type CandidateBillingCycle = "MONTHLY" | "YEARLY" | "WEEKLY";

export function candidateBillingCycle(value: string): CandidateBillingCycle {
  if (value === "YEARLY") return "YEARLY";
  if (value === "WEEKLY") return "WEEKLY";
  return "MONTHLY";
}

export function candidateNextBillingDate(
  lastDate: Date | undefined,
  cycle: CandidateBillingCycle,
) {
  if (!lastDate || Number.isNaN(lastDate.getTime())) return "";
  const dayAfterLastPayment = new Date(
    lastDate.getTime() + MILLISECONDS_PER_DAY,
  );
  return isoDate(
    nextBillingOccurrence(
      lastDate,
      cycle,
      cycle === "WEEKLY" ? DAYS_PER_WEEK : null,
      dayAfterLastPayment,
    ),
  );
}
