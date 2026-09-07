import { NextResponse } from "next/server";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { FREE_CATEGORY_LIMIT } from "@/lib/plans";
import { readJsonBody } from "@/lib/request-body";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME_LENGTH),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success)
    return NextResponse.json(
      { message: "入力内容を確認してください。" },
      { status: 400 },
    );
  const count = await prisma.category.count({ where: { userId: user.id } });
  if (user.plan === "FREE" && count >= FREE_CATEGORY_LIMIT) {
    return NextResponse.json(
      {
        message:
          "Freeプランではカテゴリは5件までです。Premiumに変更するとカテゴリを無制限に登録できます。",
      },
      { status: 403 },
    );
  }
  try {
    await prisma.category.create({ data: { userId: user.id, ...parsed.data } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { message: "同じ名前のカテゴリが既に登録されています。" },
        { status: 409 },
      );
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
