import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth";
import { MAX_USER_NAME_LENGTH } from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().trim().min(1).max(MAX_USER_NAME_LENGTH),
});

export async function PUT(request: Request) {
  const user = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "名前を入力してください。" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });

  return NextResponse.json({ ok: true });
}
