import { RENEWAL_DECISION_WINDOW_DAYS } from "./app-constants.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export type RenewalDecisionStatus = "CONTINUE" | "CANCEL_PLANNED" | "HOLD";

export function renewalDecisionStatus(value: string | null | undefined) {
  if (value === "CONTINUE" || value === "CANCEL_PLANNED" || value === "HOLD") {
    return value satisfies RenewalDecisionStatus;
  }
  return undefined;
}

export function renewalDecisionPeriod(now = new Date()) {
  const date = japanCalendarDate(now);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function isRenewalDecisionDue(
  renewalDate: Date,
  now = new Date(),
  windowDays = RENEWAL_DECISION_WINDOW_DAYS,
) {
  const reference = japanCalendarDate(now).getTime();
  const target = japanCalendarDate(renewalDate).getTime();
  const days = Math.round((target - reference) / MILLISECONDS_PER_DAY);
  return days >= 0 && days <= windowDays;
}

export function renewalDecisionStatusLabel(status: string) {
  if (status === "CONTINUE") return "継続する";
  if (status === "CANCEL_PLANNED") return "解約を検討";
  if (status === "HOLD") return "再検討する";
  return "判断済み";
}
