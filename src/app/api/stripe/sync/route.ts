import { NextResponse } from "next/server";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { billingRateLimitResponse } from "@/lib/billing-rate-limit-response";
import { syncLatestStripeSubscriptionForUser } from "@/lib/stripe-billing";

export async function POST() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const rateLimited = billingRateLimitResponse(user.id, "sync");
  if (rateLimited) return rateLimited;
  try {
    const status = await syncLatestStripeSubscriptionForUser(user.id);
    if (status === "premium") return NextResponse.json({ message: "Stripeの課金状態を確認し、Premiumプランに更新しました。" });
    if (status === "attention") return NextResponse.json({ message: "Stripeの契約を確認しました。支払い方法または契約状態の確認が必要です。Stripeの契約管理を開いてください。", attention: true });
    if (status === "free") return NextResponse.json({ message: "Stripeの課金状態を確認しました。現在、有効なPremium契約はありません。" });
    if (status === "stripe_account_mismatch") return NextResponse.json({ message: "現在のStripeアカウントまたはテスト／本番モードで契約情報を確認できませんでした。登録情報は変更していません。Stripeキーと契約したモードを確認してください。" }, { status: 409 });
    return NextResponse.json({ message: "Stripeの課金情報がまだ見つかりませんでした。決済直後の場合は少し待ってから再確認してください。" }, { status: 404 });
  } catch {
    console.error("Stripe billing sync failed.");
    return NextResponse.json({ message: "Stripeの課金状態を確認できませんでした。Stripe設定または通信状態を確認してください。" }, { status: 500 });
  }
}
