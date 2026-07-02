import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  plan: z.enum(["FREE", "PREMIUM", "LIFETIME"]),
});

export async function PUT(request: Request) {
  const user = await requireVerifiedUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "プランを選択してください。" }, { status: 400 });
  }

  if (parsed.data.plan === "PREMIUM" && env.stripeSecretKey && env.stripePremiumPriceId) {
    return NextResponse.json({ message: "Premiumへの変更はStripe Checkoutから行ってください。" }, { status: 409 });
  }
  if (parsed.data.plan === "LIFETIME" && env.stripeSecretKey && env.stripeLifetimePriceId) {
    return NextResponse.json({ message: "買い切りプランへの変更はStripe Checkoutから行ってください。" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { plan: parsed.data.plan },
  });

  return NextResponse.json({ ok: true });
}
