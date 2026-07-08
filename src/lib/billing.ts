export const MONTHS_PER_YEAR = 12;
export const AVERAGE_WEEKS_PER_MONTH = 4.345;
export const AVERAGE_DAYS_PER_MONTH = 30.437;
export const MILLISECONDS_PER_DAY = 86_400_000;
export const ISO_DATE_LENGTH = 10;

export function monthlyAmount(price: number, cycle: string, customCycleDays?: number | null) {
  if (cycle === "YEARLY") return price / MONTHS_PER_YEAR;
  if (cycle === "WEEKLY") return price * AVERAGE_WEEKS_PER_MONTH;
  if (cycle === "CUSTOM") return customCycleDays ? price * (AVERAGE_DAYS_PER_MONTH / customCycleDays) : price;
  return price;
}

export function annualAmount(price: number, cycle: string, customCycleDays?: number | null) {
  return monthlyAmount(price, cycle, customCycleDays) * MONTHS_PER_YEAR;
}

export function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / MILLISECONDS_PER_DAY);
}

export function isoDate(value?: Date | string | null) {
  return value ? new Date(value).toISOString().slice(0, ISO_DATE_LENGTH) : "";
}
