import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { billingRateLimitResponse } from "@/lib/billing-rate-limit-response";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { activePlan, syncStripeSubscription } from "@/lib/stripe-billing";
import {
  isStripeRecoveryCandidate,
  storedStripeCustomerCanBelongToUser,
} from "@/lib/stripe-customer-ownership";
import { syncStripeCustomerProfile } from "@/lib/stripe-customer-profile";
import { STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR } from "@/lib/stripe-secret-key";

type PortalUser = {
  id: string;
  email: string;
  name: string | null;
  plan: "FREE" | "PREMIUM" | "LIFETIME";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type StripeErrorFields = {
  type?: string;
  code?: string;
  param?: string;
  statusCode?: number;
  requestId?: string;
  raw?: { param?: string };
};

type PortalFailureStage =
  | "stripe_client"
  | "customer_resolution"
  | "customer_profile_sync"
  | "portal_session";

function stripeErrorFields(error: unknown): StripeErrorFields {
  return typeof error === "object" && error !== null
    ? error as StripeErrorFields
    : {};
}

function isMissingStripeResource(error: unknown) {
  const stripeError = stripeErrorFields(error);
  return stripeError.code === "resource_missing" || stripeError.param === "customer" || stripeError.raw?.param === "customer";
}

function portalErrorDetails(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("STRIPE_SECRET_KEY")) return { code: "STRIPE_SECRET_KEY_MISSING", message: "STRIPE_SECRET_KEYが設定されていません。使用するStripeモードのシークレットキーを.envに設定してください。" };
    if (error.message.includes("STRIPE_PREMIUM_PRICE_ID")) return { code: "STRIPE_PRICE_ID_MISSING", message: "STRIPE_PREMIUM_PRICE_IDが設定されていません。Stripeの価格IDを.envに設定してください。" };
    if (error.message === STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR) {
      return { code: "STRIPE_LIVE_KEY_NOT_ALLOWED", message: "Stripe本番キーの使用にはSTRIPE_LIVE_MODE_ALLOWED=trueが必要です。設定すると実際の契約・請求に影響します。テスト用キー（sk_test_...）の利用を推奨します。" };
    }
    if (error.message.includes("No configuration provided")) {
      return { code: "STRIPE_PORTAL_NOT_CONFIGURED", message: "Stripeカスタマーポータルが未設定です。Stripeダッシュボードで、現在使用中のモードのBilling > Customer portal設定を保存してください。" };
    }
  }

  const stripeError = stripeErrorFields(error);
  const param = stripeError.param ?? stripeError.raw?.param;
  if (stripeError.type === "StripeAuthenticationError") return { code: "STRIPE_AUTHENTICATION_FAILED", message: "Stripeの認証に失敗しました。STRIPE_SECRET_KEYが有効で、Price IDや顧客IDと同じStripeモードのキーか確認してください。" };
  if (stripeError.type === "StripePermissionError" || stripeError.statusCode === 403) {
    return { code: "STRIPE_PERMISSION_DENIED", message: "Stripe APIキーに必要な権限がありません。Restricted keyを使用している場合は、Customer Portal・顧客・サブスクリプションへのアクセス権を確認してください。" };
  }
  if (stripeError.type === "StripeConnectionError") return { code: "STRIPE_CONNECTION_FAILED", message: "Stripeに接続できませんでした。サーバーのネットワーク状態を確認して、時間をおいて再度お試しください。" };
  if (stripeError.type === "StripeRateLimitError") return { code: "STRIPE_RATE_LIMITED", message: "Stripeへのアクセスが集中しています。時間をおいて再度お試しください。" };
  if (stripeError.type === "StripeInvalidRequestError" && (param === "configuration" || (stripeError.code === "resource_missing" && param === "configuration"))) {
    return { code: "STRIPE_PORTAL_CONFIGURATION_INVALID", message: "Stripeポータル設定IDが見つからないか無効です。STRIPE_PORTAL_CONFIGURATION_IDを現在のStripeモードの有効な設定IDにするか、未設定にしてStripeの既定設定を使用してください。" };
  }
  if (stripeError.type === "StripeInvalidRequestError" && param === "return_url") {
    return { code: "STRIPE_RETURN_URL_INVALID", message: "Stripeの戻り先URLが正しくありません。APP_URLまたはNEXTAUTH_URLが公開サイトのURLになっているか確認してください。" };
  }
  if (stripeError.type === "StripeInvalidRequestError" && stripeError.code === "resource_missing") {
    return { code: "STRIPE_RESOURCE_NOT_FOUND", message: "Stripeの契約情報が見つかりません。Stripeのシークレットキーと顧客・契約データが同じStripeモードか確認してください。" };
  }
  if (stripeError.type === "StripeAPIError" || (stripeError.statusCode !== undefined && stripeError.statusCode >= 500)) {
    return { code: "STRIPE_TEMPORARY_FAILURE", message: "Stripe側で一時的なエラーが発生しました。時間をおいて再度お試しください。" };
  }

  return { code: "STRIPE_PORTAL_FAILED", message: "契約・解約画面を開けませんでした。Stripe設定を確認してください。" };
}

function safeStripeErrorContext(error: unknown) {
  const candidate = stripeErrorFields(error);
  const safeToken = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/.test(value) ? value : undefined;
  const statusCode = typeof candidate.statusCode === "number" && Number.isInteger(candidate.statusCode)
    ? candidate.statusCode
    : undefined;
  const requestId = typeof candidate.requestId === "string" && /^req_[A-Za-z0-9]+$/.test(candidate.requestId)
    ? candidate.requestId
    : undefined;
  return {
    type: safeToken(candidate.type),
    code: safeToken(candidate.code),
    param: safeToken(candidate.param ?? candidate.raw?.param),
    statusCode,
    requestId,
  };
}

async function retrieveCustomerId(client: Stripe, user: PortalUser) {
  try {
    const customer = await client.customers.retrieve(user.stripeCustomerId!);
    if (customer.deleted) return null;
    return storedStripeCustomerCanBelongToUser(
      customer.metadata.userId,
      user.id,
    )
      ? customer.id
      : null;
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

async function recoverCustomerIdFromSubscription(client: Stripe, user: PortalUser) {
  if (!user.stripeSubscriptionId) return null;

  try {
    const subscription = await client.subscriptions.retrieve(user.stripeSubscriptionId);
    if (
      !storedStripeCustomerCanBelongToUser(
        subscription.metadata.userId,
        user.id,
      )
    ) {
      return null;
    }
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const customer = await client.customers.retrieve(customerId);
    if (
      customer.deleted ||
      !storedStripeCustomerCanBelongToUser(customer.metadata.userId, user.id)
    ) {
      return null;
    }
    const synced = await syncStripeSubscription(subscription);
    if (!synced) return null;
    return customerId;
  } catch (error) {
    const stripeError = error as { code?: string };
    if (stripeError.code !== "resource_missing") throw error;
    return null;
  }
}

async function recoverCustomerIdFromEmail(client: Stripe, user: PortalUser) {
  const customers = await client.customers.list({ email: user.email, limit: 10 });
  for (const customer of customers.data) {
    if (customer.deleted) continue;
    const subscriptions = await client.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
    const activeSubscription = subscriptions.data.find(
      (subscription) =>
        activePlan(subscription.status) === "PREMIUM" &&
        isStripeRecoveryCandidate(
          {
            customerUserId: customer.metadata.userId,
            subscriptionUserId: subscription.metadata.userId,
          },
          user.id,
        ),
    );
    if (!activeSubscription) continue;
    await syncStripeSubscription(activeSubscription);
    return customer.id;
  }

  return null;
}

async function resolvePortalCustomerId(client: Stripe, user: PortalUser) {
  if (user.stripeCustomerId) {
    const customerId = await retrieveCustomerId(client, user);
    if (customerId) return customerId;
  }

  const subscriptionCustomerId = await recoverCustomerIdFromSubscription(client, user);
  if (subscriptionCustomerId) return subscriptionCustomerId;

  const emailCustomerId = await recoverCustomerIdFromEmail(client, user);
  if (emailCustomerId) return emailCustomerId;

  return null;
}

export async function POST() {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  const rateLimited = billingRateLimitResponse(user.id, "portal");
  if (rateLimited) return rateLimited;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!dbUser) return NextResponse.json({ message: "ユーザーが見つかりません。" }, { status: 404 });

  let stage: PortalFailureStage = "stripe_client";
  try {
    const client = stripe();
    stage = "customer_resolution";
    const customerId = await resolvePortalCustomerId(client, dbUser);
    if (!customerId) {
      return NextResponse.json({ message: "Stripeの契約情報が現在のアカウントまたはモードで見つかりませんでした。テスト／本番モードを確認してください。契約情報は変更していません。" }, { status: 409 });
    }

    stage = "customer_profile_sync";
    const profileSynced = await syncStripeCustomerProfile(
      client,
      customerId,
      dbUser,
    );
    if (!profileSynced) {
      return NextResponse.json(
        { message: "Stripe顧客情報の所有者を確認できませんでした。" },
        { status: 409 },
      );
    }

    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: `${env.appUrl}/billing`,
    };
    if (env.stripePortalConfigurationId) {
      sessionParams.configuration = env.stripePortalConfigurationId;
    }
    stage = "portal_session";
    const session = await client.billingPortal.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const details = portalErrorDetails(error);
    console.error("Stripe portal creation failed.", {
      stage,
      ...safeStripeErrorContext(error),
    });
    return NextResponse.json(details, { status: 500 });
  }
}
