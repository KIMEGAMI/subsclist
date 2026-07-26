import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminEmail, setSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ message: "ログイン情報が正しくありません。" }, { status: 401 });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "ログイン情報が正しくありません。" }, { status: 401 });
  }

  await setSession(user.id, Boolean(user.emailVerified));

  return NextResponse.json({
    ok: true,
    emailVerified: Boolean(user.emailVerified),
    redirectTo: isAdminEmail(user.email) ? "/admin" : Boolean(user.emailVerified) ? "/dashboard" : "/verify-email",
  });
}
