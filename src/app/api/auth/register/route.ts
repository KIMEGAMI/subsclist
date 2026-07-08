import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createVerificationToken, hashToken, setSession } from "@/lib/auth";
import { EMAIL_VERIFICATION_TOKEN_TTL_MS, MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MAX_USER_NAME_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/app-constants";
import { assertMailEnv } from "@/lib/env";
import { sendVerificationEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH),
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

const initialCategories = [
  ["動画", "#4f46e5"],
  ["音楽", "#ec4899"],
  ["仕事", "#0ea5e9"],
  ["学習", "#22c55e"],
  ["クラウド", "#f59e0b"],
] as const;

async function createTokenAndSend(userId: string, email: string) {
  const token = createVerificationToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
    },
  });
  await sendVerificationEmail(email, token);
}

export async function POST(request: Request) {
  try {
    assertMailEnv();
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "メール送信設定を確認してください。" }, { status: 500 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email } });

  if (exists?.emailVerified) {
    return NextResponse.json({ message: "このメールアドレスは既に登録済みです。ログインしてください。" }, { status: 409 });
  }

  if (exists && !exists.emailVerified) {
    try {
      await createTokenAndSend(exists.id, exists.email);
      await setSession(exists.id, false);
      return NextResponse.json({
        ok: true,
        alreadyRegistered: true,
        message: "このメールアドレスは登録済みですが、メール認証が未完了です。認証メールを再送しました。",
      });
    } catch (error) {
      console.error("Failed to resend verification email during registration.", error);
      await setSession(exists.id, false);
      return NextResponse.json(
        {
          message:
            "このメールアドレスは登録済みですが、メール認証が未完了です。認証メールを送信できませんでした。Google SMTPの設定を確認してください。",
          alreadyRegistered: true,
          mailSent: false,
        },
        { status: 500 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const token = createVerificationToken();
  const tokenHash = hashToken(token);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      categories: {
        create: initialCategories.map(([categoryName, color]) => ({
          name: categoryName,
          color,
        })),
      },
      emailVerificationTokens: {
        create: {
          tokenHash,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      },
    },
  });

  try {
    await sendVerificationEmail(email, token);
  } catch (error) {
    console.error("Failed to send verification email after registration.", error);
    await setSession(user.id, false);
    return NextResponse.json(
      {
        message:
          "登録は完了しましたが、認証メールを送信できませんでした。Google SMTPの設定を確認してから、メール認証画面で再送してください。",
        registered: true,
        mailSent: false,
      },
      { status: 202 },
    );
  }

  await setSession(user.id, false);
  return NextResponse.json({ ok: true, mailSent: true, message: "登録が完了しました。認証メールを送信しました。" });
}
