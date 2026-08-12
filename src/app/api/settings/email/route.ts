import { NextResponse } from "next/server";
import { z } from "zod";
import { createVerificationToken, hashToken, requireVerifiedUser } from "@/lib/auth";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS, MAX_EMAIL_LENGTH } from "@/lib/app-constants";
import { assertMailEnv, isProtectedAccountEmail } from "@/lib/env";
import { sendEmailChangeVerificationEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
});

export async function POST(request: Request) {
  const user = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "新しいメールアドレスを確認してください。" }, { status: 400 });
  }

  const newEmail = parsed.data.email.toLowerCase();
  if (isProtectedAccountEmail(user.email)) {
    return NextResponse.json({ message: "このアカウントのメールアドレスは変更できません。" }, { status: 403 });
  }
  if (isProtectedAccountEmail(newEmail)) {
    return NextResponse.json({ message: "このメールアドレスは変更先に使用できません。" }, { status: 403 });
  }
  if (newEmail === user.email.toLowerCase()) {
    return NextResponse.json({ message: "現在と異なるメールアドレスを入力してください。" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existingUser) {
    return NextResponse.json({ message: "このメールアドレスはすでに利用されています。" }, { status: 409 });
  }

  try {
    assertMailEnv();
    const token = createVerificationToken();
    await prisma.$transaction([
      prisma.emailChangeToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      prisma.emailChangeToken.create({
        data: {
          userId: user.id,
          newEmail,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
        },
      }),
    ]);
    await sendEmailChangeVerificationEmail(newEmail, token);
    return NextResponse.json({ ok: true, message: "新しいメールアドレスに確認メールを送りました。メール内のリンクを開くと変更が完了します。" });
  } catch {
    console.error("Failed to request email address change.");
    return NextResponse.json({ message: "確認メールを送信できませんでした。時間をおいて、もう一度お試しください。" }, { status: 500 });
  }
}
