import { japanCalendarDate } from "./subscription-usage.ts";

export const MONTHS_PER_YEAR = 12;
export const AVERAGE_WEEKS_PER_MONTH = 4.345;
export const AVERAGE_DAYS_PER_MONTH = 30.437;
export const MILLISECONDS_PER_SECOND = 1_000;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const ISO_DATE_LENGTH = 10;
export const DAYS_PER_WEEK = 7;
export const DEFAULT_CUSTOM_CYCLE_DAYS = 30;
export const MAX_BILLING_OCCURRENCES_PER_RANGE = 400;

export function monthlyAmount(price: number, cycle: string, customCycleDays?: number | null) {
  if (cycle === "YEARLY") return price / MONTHS_PER_YEAR;
  if (cycle === "WEEKLY") return price * AVERAGE_WEEKS_PER_MONTH;
  if (cycle === "CUSTOM") return customCycleDays ? price * (AVERAGE_DAYS_PER_MONTH / customCycleDays) : price;
  return price;
}

export function annualAmount(price: number, cycle: string, customCycleDays?: number | null) {
  return monthlyAmount(price, cycle, customCycleDays) * MONTHS_PER_YEAR;
}

export function daysUntil(date: Date, referenceDate = new Date()) {
  const today = japanCalendarDate(referenceDate);
  const target = japanCalendarDate(date);
  return Math.ceil((target.getTime() - today.getTime()) / MILLISECONDS_PER_DAY);
}

function addDaysFromAnchor(anchor: Date, days: number) {
  const result = new Date(anchor);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addMonthsFromAnchor(anchor: Date, months: number) {
  const result = new Date(anchor);
  const anchorDay = anchor.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(anchor.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchorDay, lastDay));
  return result;
}

/** Returns the first billing occurrence on or after the reference date. */
export function nextBillingOccurrence(
  nextBillingDate: Date,
  billingCycle: string,
  customCycleDays?: number | null,
  referenceDate = new Date(),
) {
  const anchor = japanCalendarDate(nextBillingDate);
  const reference = japanCalendarDate(referenceDate);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(reference.getTime())) return anchor;

  if (anchor >= reference) return anchor;

  if (billingCycle === "MONTHLY" || billingCycle === "YEARLY") {
    const monthsPerCycle = billingCycle === "YEARLY" ? MONTHS_PER_YEAR : 1;
    const elapsedMonths = (reference.getUTCFullYear() - anchor.getUTCFullYear()) * MONTHS_PER_YEAR
      + reference.getUTCMonth() - anchor.getUTCMonth();
    let cycleCount = Math.max(0, Math.floor(elapsedMonths / monthsPerCycle));
    let occurrence = addMonthsFromAnchor(anchor, cycleCount * monthsPerCycle);
    if (occurrence < reference) {
      cycleCount += 1;
      occurrence = addMonthsFromAnchor(anchor, cycleCount * monthsPerCycle);
    }
    return occurrence;
  }

  const intervalDays = billingCycle === "WEEKLY"
    ? DAYS_PER_WEEK
    : Math.max(1, customCycleDays ?? DEFAULT_CUSTOM_CYCLE_DAYS);
  const elapsedDays = Math.floor((reference.getTime() - anchor.getTime()) / MILLISECONDS_PER_DAY);
  return addDaysFromAnchor(anchor, Math.ceil(elapsedDays / intervalDays) * intervalDays);
}

/** Returns every billing occurrence in the half-open range [start, end). */
export function billingOccurrencesInRange(
  nextBillingDate: Date,
  billingCycle: string,
  customCycleDays: number | null | undefined,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const start = japanCalendarDate(rangeStart);
  const end = japanCalendarDate(rangeEnd);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || end <= start
  ) {
    return [];
  }

  const occurrences: Date[] = [];
  let occurrence = nextBillingOccurrence(
    nextBillingDate,
    billingCycle,
    customCycleDays,
    start,
  );

  while (
    occurrence >= start
    && occurrence < end
    && occurrences.length < MAX_BILLING_OCCURRENCES_PER_RANGE
  ) {
    occurrences.push(occurrence);
    const nextReference = addDaysFromAnchor(occurrence, 1);
    const nextOccurrence = nextBillingOccurrence(
      nextBillingDate,
      billingCycle,
      customCycleDays,
      nextReference,
    );
    if (nextOccurrence <= occurrence) break;
    occurrence = nextOccurrence;
  }

  return occurrences;
}

export function isoDate(value?: Date | string | null) {
  return value ? new Date(value).toISOString().slice(0, ISO_DATE_LENGTH) : "";
}
