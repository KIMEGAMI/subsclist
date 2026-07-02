import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  newPasswordConfirm: z.string().min(8).max(128),
});

export async function PUT(request: Request) {
  const sessionUser = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "現在のパスワード、新しいパスワード、確認用パスワードを入力してください。" }, { status: 400 });
  }

  if (parsed.data.newPassword !== parsed.data.newPasswordConfirm) {
    return NextResponse.json({ message: "新しいパスワードと確認用パスワードが一致しません。" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) {
    return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "現在のパスワードが正しくありません。" }, { status: 400 });
  }

  const samePassword = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (samePassword) {
    return NextResponse.json({ message: "現在とは異なるパスワードを設定してください。" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });

  return NextResponse.json({ ok: true });
}
