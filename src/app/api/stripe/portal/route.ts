import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const user = await requireVerifiedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });
  if (!dbUser.stripeCustomerId) {
    return NextResponse.json({ message: "Stripe顧客が未作成です。Premium登録後に管理できます。" }, { status: 400 });
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${env.appUrl}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal creation failed.", error);
    return NextResponse.json({ message: "Stripe管理画面を開けませんでした。Stripe設定を確認してください。" }, { status: 500 });
  }
}
