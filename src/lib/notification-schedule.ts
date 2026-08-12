import { DEFAULT_NOTIFICATION_HOUR } from "./app-constants.ts";

export function japanHour(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value);
}

export function shouldRunNotificationAtHour(notificationHour: number | null | undefined, now = new Date()): boolean {
  return (notificationHour ?? DEFAULT_NOTIFICATION_HOUR) === japanHour(now);
}
