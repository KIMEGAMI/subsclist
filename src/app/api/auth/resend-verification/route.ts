import { NextResponse } from "next/server";
import { createVerificationToken, getCurrentUser, hashToken } from "@/lib/auth";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS } from "@/lib/app-constants";
import { assertMailEnv } from "@/lib/env";
import { userErrorMessage } from "@/lib/error-messages";
import { sendVerificationEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    assertMailEnv();
  } catch (error) {
    return NextResponse.json({ message: userErrorMessage(error, "メール送信設定を確認してください。") }, { status: 500 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, message: "このアカウントは既にメール認証済みです。" });
  }

  const token = createVerificationToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    },
  });

  try {
    await sendVerificationEmail(user.email, token);
  } catch (error) {
    console.error("Failed to send verification email from resend endpoint.", error);
    return NextResponse.json({ message: "認証メールを送信できませんでした。Google SMTPの設定を確認してください。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "認証メールを再送しました。" });
}
