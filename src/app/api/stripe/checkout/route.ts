import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

const messages = {
  userNotFound: "\u30e6\u30fc\u30b6\u30fc\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
  missingSecret: "STRIPE_SECRET_KEY\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002Stripe\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u306e\u958b\u767a\u8005 > API\u30ad\u30fc\u304b\u3089sk_test_...\u307e\u305f\u306fsk_live_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  missingPriceEnv: "STRIPE_PREMIUM_PRICE_ID\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002Stripe\u306e\u5546\u54c1\u3067\u306f\u306a\u304f\u3001\u4fa1\u683c\u306eprice_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  invalidKey: "Stripe\u306e\u30b7\u30fc\u30af\u30ec\u30c3\u30c8\u30ad\u30fc\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002STRIPE_SECRET_KEY\u306bStripe\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u306e\u30c6\u30b9\u30c8\u7528\u30b7\u30fc\u30af\u30ec\u30c3\u30c8\u30ad\u30fc\uff08sk_test_...\uff09\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  missingPrice: "Stripe\u306e\u4fa1\u683cID\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002STRIPE_PREMIUM_PRICE_ID\u304c\u3001\u73fe\u5728\u306eStripe\u30ad\u30fc\u3068\u540c\u3058\u30c6\u30b9\u30c8/\u672c\u756a\u30e2\u30fc\u30c9\u306eprice_...\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  inactivePrice: "Stripe\u306ePrice\u304c\u7121\u52b9\u3067\u3059\u3002Stripe\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u3067\u4fa1\u683c\u304c\u6709\u52b9\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  oneTimePrice: "Stripe\u306ePrice\u304c\u4e00\u56de\u9650\u308a\u306e\u4fa1\u683c\u3067\u3059\u3002\u6708\u984d\u306e\u7d99\u7d9a\u8ab2\u91d1\uff08Recurring / Monthly\uff09\u306eprice_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  notMonthly: "Stripe\u306ePrice\u306f\u7d99\u7d9a\u8ab2\u91d1\u3067\u3059\u304c\u3001\u6708\u984d\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002\u8acb\u6c42\u671f\u9593\u304cMonthly\u306eprice_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  invalidCustomer: "DB\u306b\u4fdd\u5b58\u3055\u308c\u305fStripe\u9867\u5ba2ID\u304c\u73fe\u5728\u306eStripe\u30ad\u30fc\u3067\u898b\u3064\u304b\u3089\u306a\u304b\u3063\u305f\u305f\u3081\u3001\u9867\u5ba2\u60c5\u5831\u3092\u518d\u4f5c\u6210\u3057\u307e\u3057\u305f\u3002\u3082\u3046\u4e00\u5ea6Premium\u306b\u30a2\u30c3\u30d7\u30b0\u30ec\u30fc\u30c9\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  invalidRequest: "Stripe Checkout\u306e\u4f5c\u6210\u6761\u4ef6\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002Price\u304c\u6708\u984d\u30b5\u30d6\u30b9\u30af\u30ea\u30d7\u30b7\u30e7\u30f3\u3068\u3057\u3066\u6709\u52b9\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  failed: "Stripe Checkout\u306e\u4f5c\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002Stripe\u8a2d\u5b9a\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
};

function checkoutErrorMessage(error: unknown) {
  if (error instanceof StripeConfigError) return error.message;
  if (error instanceof Error) {
    if (error.message === "STRIPE_SECRET_KEY is not set.") return messages.missingSecret;
    if (error.message === "STRIPE_PREMIUM_PRICE_ID is not set.") return messages.missingPriceEnv;
  }
  const stripeError = error as { type?: string; code?: string; param?: string; raw?: { param?: string } };
  if (stripeError.type === "StripeAuthenticationError") return messages.invalidKey;
  if (stripeError.code === "resource_missing") return messages.missingPrice;
  if (stripeError.param === "customer" || stripeError.raw?.param === "customer") return messages.invalidCustomer;
  if (stripeError.type === "StripeInvalidRequestError") return messages.invalidRequest;
  return messages.failed;
}

async function assertPremiumPrice(client: Stripe) {
  const price = await client.prices.retrieve(env.stripePremiumPriceId);
  if (!price.active) throw new StripeConfigError(messages.inactivePrice);
  if (!price.recurring) throw new StripeConfigError(messages.oneTimePrice);
  if (price.recurring.interval !== "month") throw new StripeConfigError(messages.notMonthly);
  return price;
}

async function createCustomer(client: Stripe, user: { id: string; email: string; name: string | null }) {
  const customer = await client.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

async function ensureCustomer(client: Stripe, user: { id: string; email: string; name: string | null; stripeCustomerId: string | null }) {
  if (!user.stripeCustomerId) return createCustomer(client, user);

  try {
    const customer = await client.customers.retrieve(user.stripeCustomerId);
    if (!customer.deleted) return user.stripeCustomerId;
  } catch (error) {
    const stripeError = error as { code?: string; param?: string; raw?: { param?: string } };
    if (stripeError.code !== "resource_missing" && stripeError.param !== "customer" && stripeError.raw?.param !== "customer") {
      throw error;
    }
  }

  console.warn("Stored Stripe customer was not found. Recreating customer.", { userId: user.id, stripeCustomerId: user.stripeCustomerId });
  return createCustomer(client, user);
}

export async function POST() {
  const user = await requireVerifiedUser();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) return NextResponse.json({ message: messages.userNotFound }, { status: 404 });

  try {
    const client = stripe();
    await assertPremiumPrice(client);
    const customerId = await ensureCustomer(client, dbUser);

    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: env.stripePremiumPriceId, quantity: 1 }],
      success_url: `${env.appUrl}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.appUrl}/settings?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { userId: dbUser.id },
      subscription_data: { metadata: { userId: dbUser.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout creation failed.", error);
    return NextResponse.json({ message: checkoutErrorMessage(error) }, { status: 500 });
  }
}
