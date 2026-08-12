import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireVerifiedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { activePlan, syncStripeSubscription } from "@/lib/stripe-billing";

type PortalUser = {
  id: string;
  email: string;
  plan: "FREE" | "PREMIUM" | "LIFETIME";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function isMissingStripeResource(error: unknown) {
  const stripeError = error as { code?: string; param?: string; raw?: { param?: string } };
  return stripeError.code === "resource_missing" || stripeError.param === "customer" || stripeError.raw?.param === "customer";
}

function portalErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("STRIPE_SECRET_KEY")) return "STRIPE_SECRET_KEYが設定されていません。Stripeのテスト用シークレットキーを.envに設定してください。";
    if (error.message.includes("STRIPE_PREMIUM_PRICE_ID")) return "STRIPE_PREMIUM_PRICE_IDが設定されていません。Stripeの価格IDを.envに設定してください。";
    if (error.message.includes("No configuration provided")) {
      return "Stripeカスタマーポータルが未設定です。Stripeダッシュボードのテストモードで、BillingのCustomer portal設定を保存してください。";
    }
  }

  const stripeError = error as { type?: string; param?: string; raw?: { param?: string } };
  if (stripeError.type === "StripeAuthenticationError") return "Stripeのシークレットキーが正しくありません。STRIPE_SECRET_KEYを確認してください。";
  if (stripeError.type === "StripeInvalidRequestError" && (stripeError.param === "return_url" || stripeError.raw?.param === "return_url")) {
    return "Stripeの戻り先URLが正しくありません。APP_URLまたはNEXTAUTH_URLを確認してください。";
  }

  return "契約・解約画面を開けませんでした。Stripe設定を確認してください。";
}

async function retrieveCustomerId(client: Stripe, customerId: string) {
  try {
    const customer = await client.customers.retrieve(customerId);
    return customer.deleted ? null : customer.id;
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

async function recoverCustomerIdFromSubscription(client: Stripe, user: PortalUser) {
  if (!user.stripeSubscriptionId) return null;

  try {
    const subscription = await client.subscriptions.retrieve(user.stripeSubscriptionId);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    await syncStripeSubscription(subscription);
    return customerId;
  } catch (error) {
    const stripeError = error as { code?: string };
    if (stripeError.code !== "resource_missing") throw error;
    await prisma.user.update({ where: { id: user.id }, data: { stripeSubscriptionId: null } });
    return null;
  }
}

async function recoverCustomerIdFromEmail(client: Stripe, user: PortalUser) {
  if (user.plan !== "PREMIUM") return null;

  const customers = await client.customers.list({ email: user.email, limit: 10 });
  for (const customer of customers.data) {
    if (customer.deleted) continue;
    const subscriptions = await client.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
    const activeSubscription = subscriptions.data.find((subscription) => activePlan(subscription.status) === "PREMIUM");
    if (!activeSubscription) continue;
    await syncStripeSubscription(activeSubscription);
    return customer.id;
  }

  return null;
}

async function resolvePortalCustomerId(client: Stripe, user: PortalUser) {
  if (user.stripeCustomerId) {
    const customerId = await retrieveCustomerId(client, user.stripeCustomerId);
    if (customerId) return customerId;
  }

  const subscriptionCustomerId = await recoverCustomerIdFromSubscription(client, user);
  if (subscriptionCustomerId) return subscriptionCustomerId;

  const emailCustomerId = await recoverCustomerIdFromEmail(client, user);
  if (emailCustomerId) return emailCustomerId;

  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: null, stripeSubscriptionId: null, plan: user.plan === "LIFETIME" ? "PREMIUM" : "FREE" } });
  return null;
}

export async function POST() {
  const user = await requireVerifiedUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!dbUser) return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });

  try {
    const client = stripe();
    const customerId = await resolvePortalCustomerId(client, dbUser);
    if (!customerId) {
      return NextResponse.json({ message: "Stripeの契約情報を確認できませんでした。課金状態を再確認するか、Premiumに再加入してください。" }, { status: 409 });
    }

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${env.appUrl}/settings`,
    };
    if (env.stripePortalConfigurationId) {
      sessionParams.configuration = env.stripePortalConfigurationId;
    }
    const session = await client.billingPortal.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal creation failed.");
    return NextResponse.json({ message: portalErrorMessage(error) }, { status: 500 });
  }
}
