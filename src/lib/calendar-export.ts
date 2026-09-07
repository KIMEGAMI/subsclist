import { billingOccurrencesInRange, MILLISECONDS_PER_DAY } from "./billing.ts";
import { japanCalendarDate } from "./subscription-usage.ts";

export const CALENDAR_EXPORT_MONTHS = 12;
export const CALENDAR_EXPORT_MAX_EVENTS = 2_000;
export const ICALENDAR_MAX_LINE_OCTETS = 75;

export type CalendarExportSubscription = {
  id: string;
  name: string;
  price: number;
  billingCycle: string;
  customCycleDays: number | null;
  nextBillingDate: Date;
  trialEndsAt: Date | null;
  cancellationDeadline: Date | null;
};

type CalendarEventKind = "RENEWAL" | "TRIAL" | "CANCELLATION";

type CalendarEvent = {
  kind: CalendarEventKind;
  subscriptionId: string;
  subscriptionName: string;
  date: Date;
  price: number;
};

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function calendarDate(value: Date) {
  return japanCalendarDate(value).toISOString().slice(0, 10).replace(/-/g, "");
}

function utcTimestamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextCalendarDay(value: Date) {
  return new Date(japanCalendarDate(value).getTime() + MILLISECONDS_PER_DAY);
}

function safeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 191) || "record";
}

export function foldICalendarLine(line: string) {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = ICALENDAR_MAX_LINE_OCTETS;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (current && currentBytes + characterBytes > limit) {
      folded.push(current);
      current = ` ${character}`;
      currentBytes = 1 + characterBytes;
      limit = ICALENDAR_MAX_LINE_OCTETS;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  folded.push(current);
  return folded;
}

function eventSummary(kind: CalendarEventKind, name: string) {
  if (kind === "TRIAL") return `無料期間終了: ${name}`;
  if (kind === "CANCELLATION") return `解約期限: ${name}`;
  return `更新予定: ${name}`;
}

function eventDescription(event: CalendarEvent) {
  if (event.kind === "RENEWAL") return `請求予定額: ￥${event.price.toLocaleString("ja-JP")}\nSubscListで支払い条件を確認してください。`;
  if (event.kind === "TRIAL") return "無料期間の終了予定日です。継続するか更新前に確認してください。";
  return "解約期限です。継続・解約の判断と手続き状況を確認してください。";
}

function inRange(value: Date, start: Date, end: Date) {
  const date = japanCalendarDate(value);
  return date >= start && date < end;
}

export function buildSubscriptionCalendar(
  subscriptions: CalendarExportSubscription[],
  generatedAt = new Date(),
) {
  const rangeStart = japanCalendarDate(generatedAt);
  const rangeEnd = new Date(Date.UTC(
    rangeStart.getUTCFullYear(),
    rangeStart.getUTCMonth() + CALENDAR_EXPORT_MONTHS,
    rangeStart.getUTCDate(),
  ));
  const events: CalendarEvent[] = [];

  for (const subscription of subscriptions) {
    for (const date of billingOccurrencesInRange(
      subscription.nextBillingDate,
      subscription.billingCycle,
      subscription.customCycleDays,
      rangeStart,
      rangeEnd,
    )) {
      events.push({
        kind: "RENEWAL",
        subscriptionId: subscription.id,
        subscriptionName: subscription.name,
        date,
        price: subscription.price,
      });
    }
    if (subscription.trialEndsAt && inRange(subscription.trialEndsAt, rangeStart, rangeEnd)) {
      events.push({ kind: "TRIAL", subscriptionId: subscription.id, subscriptionName: subscription.name, date: subscription.trialEndsAt, price: subscription.price });
    }
    if (subscription.cancellationDeadline && inRange(subscription.cancellationDeadline, rangeStart, rangeEnd)) {
      events.push({ kind: "CANCELLATION", subscriptionId: subscription.id, subscriptionName: subscription.name, date: subscription.cancellationDeadline, price: subscription.price });
    }
  }

  events.sort((left, right) => left.date.getTime() - right.date.getTime()
    || left.subscriptionName.localeCompare(right.subscriptionName, "ja")
    || left.kind.localeCompare(right.kind));
  const visibleEvents = events.slice(0, CALENDAR_EXPORT_MAX_EVENTS);
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//SubscList//Subscription Calendar//JA",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SubscList 更新予定",
    `X-SUBSCLIST-RANGE-END:${calendarDate(rangeEnd)}`,
    `X-SUBSCLIST-TRUNCATED:${events.length > visibleEvents.length ? "TRUE" : "FALSE"}`,
  ];

  for (const event of visibleEvents) {
    const date = calendarDate(event.date);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.kind.toLowerCase()}-${safeIdentifier(event.subscriptionId)}-${date}@subsclist`,
      `DTSTAMP:${utcTimestamp(generatedAt)}`,
      `DTSTART;VALUE=DATE:${date}`,
      `DTEND;VALUE=DATE:${calendarDate(nextCalendarDay(event.date))}`,
      `SUMMARY:${escapeText(eventSummary(event.kind, event.subscriptionName))}`,
      `DESCRIPTION:${escapeText(eventDescription(event))}`,
      `CATEGORIES:${event.kind === "RENEWAL" ? "更新予定" : event.kind === "TRIAL" ? "無料期間" : "解約期限"}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.flatMap(foldICalendarLine).join("\r\n")}\r\n`;
}
