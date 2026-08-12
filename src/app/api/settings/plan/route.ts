import { NextResponse } from "next/server";

export async function PUT() {
  return NextResponse.json(
    { message: "プランはStripe CheckoutまたはStripeカスタマーポータルから変更してください。" },
    { status: 405 },
  );
}
