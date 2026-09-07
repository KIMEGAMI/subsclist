import { z } from "zod";
import { MAX_SUBSCRIPTION_PRICE } from "./app-constants.ts";
import { parseIsoCalendarDate } from "./calendar-date.ts";
import { japanCalendarDate, shiftCalendarDays } from "./subscription-usage.ts";

export const scheduledPriceInputSchema = z.object({
  price: z.coerce.number().int().min(0).max(MAX_SUBSCRIPTION_PRICE),
  effectiveAt: z.string().refine((value) => parseIsoCalendarDate(value) !== null),
});

export function scheduledPriceDateAllowed(effectiveAt: Date, now = new Date()) {
  return japanCalendarDate(effectiveAt).getTime() >= japanCalendarDate(now).getTime();
}

export function scheduledPriceNoticeDue(
  effectiveAt: Date,
  daysBefore: number,
  now = new Date(),
) {
  const today = japanCalendarDate(now);
  const target = japanCalendarDate(effectiveAt);
  const noticeWindowEnd = shiftCalendarDays(today, Math.max(0, Math.floor(daysBefore)));
  return target.getTime() >= today.getTime() && target.getTime() <= noticeWindowEnd.getTime();
}

export function scheduledPriceDifference(currentPrice: number, scheduledPrice: number) {
  return scheduledPrice - currentPrice;
}
