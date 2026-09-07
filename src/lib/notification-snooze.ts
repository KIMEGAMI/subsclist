import { z } from "zod";

export const NOTIFICATION_SNOOZE_DAYS = {
  ONE_DAY: 1,
  SEVEN_DAYS: 7,
  THIRTY_DAYS: 30,
} as const;

export const notificationSnoozeInputSchema = z.object({
  duration: z.enum(["ONE_DAY", "SEVEN_DAYS", "THIRTY_DAYS", "CLEAR"]),
});

export type NotificationSnoozeDuration = z.infer<typeof notificationSnoozeInputSchema>["duration"];

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = HOURS_PER_DAY
  * MINUTES_PER_HOUR
  * SECONDS_PER_MINUTE
  * MILLISECONDS_PER_SECOND;

export function notificationSnoozeUntil(duration: NotificationSnoozeDuration, now = new Date()) {
  if (duration === "CLEAR") return null;
  return new Date(now.getTime() + NOTIFICATION_SNOOZE_DAYS[duration] * MILLISECONDS_PER_DAY);
}

export function isSubscriptionNotificationSnoozed(
  snoozedUntil: Date | null | undefined,
  now = new Date(),
) {
  return Boolean(snoozedUntil && snoozedUntil.getTime() > now.getTime());
}
