import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import {
  ALLOWED_URL_PROTOCOLS,
  MAX_MEMO_LENGTH,
  MAX_SUBSCRIPTION_NAME_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/app-constants";
import { parseIsoCalendarDate } from "@/lib/calendar-date";
import { prisma } from "@/lib/prisma";
import { isPremiumPlan } from "@/lib/plans";
import { readJsonBody } from "@/lib/request-body";

const schema = z.object({
  subscriptionId: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_SUBSCRIPTION_NAME_LENGTH),
  kind: z.enum(["REQUEST", "RECEIPT", "EMAIL", "SCREENSHOT", "MEMO"]),
  referenceUrl: z.string().max(MAX_URL_LENGTH).optional(),
  memo: z.string().max(MAX_MEMO_LENGTH).optional(),
  recordedAt: z
    .string()
    .refine((value) => parseIsoCalendarDate(value) !== null)
    .optional(),
});

function optionalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (ALLOWED_URL_PROTOCOLS as readonly string[]).includes(url.protocol)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  if (!isPremiumPlan(user.plan))
    return NextResponse.json(
      { message: "解約支援はPremium限定です。" },
      { status: 403 },
    );

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );

  const subscription = await prisma.subscription.findFirst({
    where: { id: parsed.data.subscriptionId, userId: user.id, deletedAt: null },
  });
  if (!subscription)
    return NextResponse.json(
      { message: "対象が見つかりません。" },
      { status: 404 },
    );

  await prisma.cancellationEvidence.create({
    data: {
      userId: user.id,
      subscriptionId: subscription.id,
      title: parsed.data.title,
      kind: parsed.data.kind,
      referenceUrl: optionalUrl(parsed.data.referenceUrl),
      memo: parsed.data.memo || null,
      recordedAt: parsed.data.recordedAt
        ? (parseIsoCalendarDate(parsed.data.recordedAt) as Date)
        : new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
