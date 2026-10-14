import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminApiUser } from "@/lib/api-auth";
import { MAX_ADMIN_EMAIL_REQUEST_BODY_BYTES } from "@/lib/app-constants";
import { assertMailEnv } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendAdminBulkEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { readJsonBodyWithLimit } from "@/lib/request-body";

const schema = z.object({
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  recipientScope: z.enum(["VERIFIED", "ALL", "PREMIUM"]).default("VERIFIED"),
});

export async function POST(request: Request) {
  const access = await getAdminApiUser();
  if (!access.ok) return access.response;

  const body = await readJsonBodyWithLimit(
    request,
    MAX_ADMIN_EMAIL_REQUEST_BODY_BYTES,
  );
  if (!body.ok && body.reason === "too_large") {
    return NextResponse.json(
      { message: "メールの内容が大きすぎます。本文を短くして、もう一度お試しください。" },
      { status: 413 },
    );
  }
  if (!body.ok) {
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "件名、本文、送信対象を確認してください。" },
      { status: 400 },
    );
  }

  try {
    assertMailEnv();
  } catch (error) {
    return NextResponse.json(
      {
        message: userErrorMessage(error, "メール送信設定を確認してください。"),
      },
      { status: 500 },
    );
  }

  const where: Prisma.UserWhereInput =
    parsed.data.recipientScope === "PREMIUM"
      ? { emailVerified: { not: null }, plan: { in: ["PREMIUM", "LIFETIME"] } }
      : parsed.data.recipientScope === "VERIFIED"
        ? { emailVerified: { not: null } }
        : {};

  const users = await prisma.user.findMany({
    where,
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const user of users) {
    try {
      await sendAdminBulkEmail({
        to: user.email,
        subject: parsed.data.subject,
        body: parsed.data.body,
      });
      sent += 1;
    } catch {
      failed += 1;
      console.error("Bulk email send failed for one recipient.");
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    sent,
    failed,
    total: users.length,
  });
}
