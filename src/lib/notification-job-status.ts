import { z } from "zod";

export const NOTIFICATION_JOB_STATUS_KEY = "notification_job_status";
export const NOTIFICATION_JOB_STALE_AFTER_MS = 3 * 60 * 60 * 1_000;

const isoDateTimeSchema = z.string().refine(
  (value) => !Number.isNaN(new Date(value).getTime()),
);

export const notificationJobStatusSchema = z.object({
  state: z.enum(["RUNNING", "SUCCEEDED", "PARTIAL"]),
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  sent: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failures: z.number().int().min(0),
});

export type NotificationJobStatus = z.infer<typeof notificationJobStatusSchema>;
export type NotificationJobHealth =
  | "UNKNOWN"
  | "RUNNING"
  | "HEALTHY"
  | "DEGRADED"
  | "STALE";

export function parseNotificationJobStatus(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = notificationJobStatusSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeNotificationJobStatus(status: NotificationJobStatus) {
  return JSON.stringify(notificationJobStatusSchema.parse(status));
}

export function notificationJobHealth(
  status: NotificationJobStatus | null,
  now = new Date(),
): NotificationJobHealth {
  if (!status) return "UNKNOWN";
  const reference = new Date(status.completedAt ?? status.startedAt);
  if (now.getTime() - reference.getTime() > NOTIFICATION_JOB_STALE_AFTER_MS) {
    return "STALE";
  }
  if (status.state === "RUNNING") return "RUNNING";
  if (status.state === "PARTIAL" || status.failures > 0) return "DEGRADED";
  return "HEALTHY";
}
