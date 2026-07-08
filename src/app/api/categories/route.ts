import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { FREE_CATEGORY_LIMIT } from "@/lib/plans";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "ログインしてください。" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ message: "メール認証が必要です。" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  const count = await prisma.category.count({ where: { userId: user.id } });
  if (user.plan === "FREE" && count >= FREE_CATEGORY_LIMIT) {
    return NextResponse.json({ message: "Freeプランではカテゴリは5件までです。Premiumに変更するとカテゴリを無制限に登録できます。" }, { status: 403 });
  }
  await prisma.category.create({ data: { userId: user.id, ...parsed.data } });
  return NextResponse.json({ ok: true });
}
