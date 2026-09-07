import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  MAX_NOTIFICATION_HOUR,
  MAX_NOTIFY_DAYS_BEFORE,
  MAX_SUBSCRIPTION_PRICE,
  MIN_NOTIFICATION_HOUR,
} from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/request-body";

const schema = z.object({
  monthlyBudget: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_SUBSCRIPTION_PRICE)
    .optional(),
  defaultNotifyDaysBefore: z.coerce.number().min(0).max(MAX_NOTIFY_DAYS_BEFORE),
  notificationHour: z.coerce
    .number()
    .min(MIN_NOTIFICATION_HOUR)
    .max(MAX_NOTIFICATION_HOUR),
  monthlyDigestEnabled: z.boolean(),
});

export async function PUT(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      monthlyBudget: parsed.data.monthlyBudget || null,
      defaultNotifyDaysBefore: parsed.data.defaultNotifyDaysBefore,
      notificationHour: parsed.data.notificationHour,
      monthlyDigestEnabled: parsed.data.monthlyDigestEnabled,
    },
    update: {
      monthlyBudget: parsed.data.monthlyBudget || null,
      defaultNotifyDaysBefore: parsed.data.defaultNotifyDaysBefore,
      notificationHour: parsed.data.notificationHour,
      monthlyDigestEnabled: parsed.data.monthlyDigestEnabled,
    },
  });

  return NextResponse.json({ ok: true });
}
