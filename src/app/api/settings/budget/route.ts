import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { MAX_NOTIFICATION_HOUR, MAX_NOTIFY_DAYS_BEFORE, MIN_NOTIFICATION_HOUR } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  monthlyBudget: z.coerce.number().min(0).optional(),
  defaultNotifyDaysBefore: z.coerce.number().min(0).max(MAX_NOTIFY_DAYS_BEFORE),
  notificationHour: z.coerce.number().min(MIN_NOTIFICATION_HOUR).max(MAX_NOTIFICATION_HOUR),
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      monthlyBudget: parsed.data.monthlyBudget || null,
      defaultNotifyDaysBefore: parsed.data.defaultNotifyDaysBefore,
      notificationHour: parsed.data.notificationHour,
    },
    update: {
      monthlyBudget: parsed.data.monthlyBudget || null,
      defaultNotifyDaysBefore: parsed.data.defaultNotifyDaysBefore,
      notificationHour: parsed.data.notificationHour,
    },
  });

  return NextResponse.json({ ok: true });
}
