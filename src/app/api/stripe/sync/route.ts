import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/auth";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe-billing";

export async function POST() {
  const user = await requireVerifiedUser();
  try {
    const status = await syncLatestStripeSubscriptionForUser(user.id);
    if (status === "premium") return NextResponse.json({ message: "Stripeの課金状態を確認し、Premiumプランに更新しました。" });
    if (status === "free") return NextResponse.json({ message: "Stripeの課金状態を確認しました。現在、有効なPremium契約はありません。" });
    return NextResponse.json({ message: "Stripeの課金情報がまだ見つかりませんでした。決済直後の場合は少し待ってから再確認してください。" }, { status: 404 });
  } catch (error) {
    console.error("Stripe billing sync failed.", error);
    return NextResponse.json({ message: "Stripeの課金状態を確認できませんでした。Stripe設定または通信状態を確認してください。" }, { status: 500 });
  }
}
