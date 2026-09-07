import { z } from "zod";

function normalizeBooleanInput(value: unknown) {
  if (value === true || value === "true" || value === "on" || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === "off" || value === "0") {
    return false;
  }
  return value;
}

export const optionalNotificationEnabledSchema = z.preprocess(
  normalizeBooleanInput,
  z.boolean().optional(),
);

export const notificationEnabledSchema = optionalNotificationEnabledSchema.default(true);

export function effectiveSubscriptionNotification({
  settings,
  subscriptionDaysBefore,
  fallbackDaysBefore,
}: {
  settings: Array<{ enabled: boolean; daysBefore: number }> | undefined;
  subscriptionDaysBefore: number | null;
  fallbackDaysBefore: number;
}) {
  const setting = settings?.[0];
  return {
    enabled: setting?.enabled ?? true,
    daysBefore:
      setting?.daysBefore
      ?? subscriptionDaysBefore
      ?? fallbackDaysBefore,
  };
}
