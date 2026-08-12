const ISO_CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoCalendarDate(value: string): Date | null {
  if (!ISO_CALENDAR_DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}
