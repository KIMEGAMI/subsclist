import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getVerifiedApiUser } from "@/lib/api-auth";
import { billingRateLimitResponse } from "@/lib/billing-rate-limit-response";
import { env } from "@/lib/env";
import {
  MAX_BILLING_REQUEST_BODY_BYTES,
  PREMIUM_MONTHLY_PRICE_YEN,
  STRIPE_SUBSCRIPTION_STATUS_ALL,
  STRIPE_TRIAL_LOOKBACK_SUBSCRIPTION_LIMIT,
  STRIPE_CHECKOUT_LOCK_TTL_MS,
} from "@/lib/app-constants";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  hasPremiumStripeStatus,
  syncStripeCheckoutSession,
  syncStripeSubscription,
} from "@/lib/stripe-billing";
import { stripeSubscriptionCanBeManaged } from "@/lib/stripe-entitlement";
import { hasHistoricalTrialByEmail } from "@/lib/stripe-trial-history";
import {
  hasStripeTrial,
  shouldCheckHistoricalTrialByEmail,
  stripeTrialCheckoutData,
} from "@/lib/stripe-trial";
import { storedStripeCustomerCanBelongToUser } from "@/lib/stripe-customer-ownership";
import { syncStripeCustomerProfile } from "@/lib/stripe-customer-profile";
import { validatePremiumStripePrice } from "@/lib/stripe-price";
import { wantsStripeCheckoutRedirect } from "@/lib/stripe-checkout-response";
import { readJsonBodyWithLimit } from "@/lib/request-body";
import { STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR } from "@/lib/stripe-secret-key";

class StripeConfigError extends Error {
  constructor(message: string, status = 500) {
    super(message);
    this.name = "StripeConfigError";
    this.status = status;
  }

  status: number;
}

const messages = {
  userNotFound:
    "\u30e6\u30fc\u30b6\u30fc\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
  missingSecret:
    "STRIPE_SECRET_KEY\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002Stripe\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u306e\u958b\u767a\u8005 > API\u30ad\u30fc\u304b\u3089sk_test_...\u307e\u305f\u306fsk_live_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  missingPriceEnv:
    "STRIPE_PREMIUM_PRICE_ID\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002Stripe\u306e\u5546\u54c1\u3067\u306f\u306a\u304f\u3001\u4fa1\u683c\u306eprice_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  liveModeDisabled:
    "Stripe本番キーを使うにはSTRIPE_LIVE_MODE_ALLOWED=trueが必要です。設定すると実際の決済・請求が発生するため、テスト用キー（sk_test_...）の利用を推奨します。",
  invalidKey:
    "Stripe\u306e\u30b7\u30fc\u30af\u30ec\u30c3\u30c8\u30ad\u30fc\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002STRIPE_SECRET_KEY\u306b\u3001\u4f7f\u7528\u3059\u308bStripe\u30e2\u30fc\u30c9\u306e\u30b7\u30fc\u30af\u30ec\u30c3\u30c8\u30ad\u30fc\uff08\u672c\u756a: sk_live_... / \u30c6\u30b9\u30c8: sk_test_...\uff09\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  missingPrice:
    "Stripe\u306e\u4fa1\u683cID\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002STRIPE_PREMIUM_PRICE_ID\u304c\u3001\u73fe\u5728\u306eStripe\u30ad\u30fc\u3068\u540c\u3058\u30c6\u30b9\u30c8/\u672c\u756a\u30e2\u30fc\u30c9\u306eprice_...\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  inactivePrice:
    "Stripe\u306ePrice\u304c\u7121\u52b9\u3067\u3059\u3002Stripe\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9\u3067\u4fa1\u683c\u304c\u6709\u52b9\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  notMonthly:
    "Stripe\u306ePrice\u306f\u7d99\u7d9a\u8ab2\u91d1\u3067\u3059\u304c\u3001\u6708\u984d\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002\u8acb\u6c42\u671f\u9593\u304cMonthly\u306eprice_...\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  wrongCurrency:
    "StripeのPrice通貨が正しくありません。JPYのPriceを設定してください。",
  wrongAmount: `StripeのPrice金額が正しくありません。月額${PREMIUM_MONTHLY_PRICE_YEN}円のPriceを設定してください。`,
  meteredPrice:
    "StripeのPriceが従量課金です。月額固定料金のPriceを設定してください。",
  invalidCustomer:
    "保存済みのStripe顧客を現在のStripeアカウント／モードで確認できませんでした。既存の紐付けは保持し、新しい顧客やCheckoutは作成していません。Stripeアカウントとテスト／本番モードを確認してください。",
  invalidCheckoutSession:
    "保存済みのStripe申込みを現在のStripeアカウント／モードで確認できませんでした。既存の紐付けは保持し、新しい申込みは作成していません。Stripeアカウントとテスト／本番モードを確認してください。",
  invalidRequest:
    "Stripe Checkout\u306e\u4f5c\u6210\u6761\u4ef6\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002Price\u304c\u6708\u984d\u30b5\u30d6\u30b9\u30af\u30ea\u30d7\u30b7\u30e7\u30f3\u3068\u3057\u3066\u6709\u52b9\u306b\u306a\u3063\u3066\u3044\u308b\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  failed:
    "Stripe Checkout\u306e\u4f5c\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002Stripe\u8a2d\u5b9a\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  alreadySubscribed:
    "\u3059\u3067\u306b\u6709\u52b9\u306aPremium\u5951\u7d04\u304c\u3042\u308a\u307e\u3059\u3002\u91cd\u8907\u8ab2\u91d1\u3092\u9632\u3050\u305f\u3081\u3001\u65b0\u3057\u3044Checkout\u306f\u4f5c\u6210\u3057\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
  existingSubscriptionNeedsAttention:
    "既存のPremium契約が支払い処理中、または確認を必要としています。重複契約を防ぐため新しい申込みは作成しません。「契約・解約」から現在の契約状態をご確認ください。",
  historicalTrial: `このメールアドレスでは無料体験の利用履歴が確認されました。無料期間なしで月額${PREMIUM_MONTHLY_PRICE_YEN}円の契約を開始する場合は、内容を確認してからもう一度お申し込みください。`,
};

const checkoutRequestSchema = z.object({
  confirmWithoutTrial: z.boolean().optional().default(false),
});

type CheckoutUser = {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
  trialUsedAt: Date | null;
};

function checkoutErrorMessage(error: unknown) {
  if (error instanceof StripeConfigError) return error.message;
  if (error instanceof Error) {
    if (error.message === "STRIPE_SECRET_KEY is not set.")
      return messages.missingSecret;
    if (
      error.message.startsWith(
        "STRIPE_SECRET_KEY must be a Stripe server-side secret key",
      )
    )
      return messages.invalidKey;
    if (
      error.message ===
      STRIPE_LIVE_MODE_NOT_ALLOWED_ERROR
    )
      return messages.liveModeDisabled;
    if (error.message === "STRIPE_PREMIUM_PRICE_ID is not set.")
      return messages.missingPriceEnv;
  }
  const stripeError = error as {
    type?: string;
    code?: string;
    param?: string;
    raw?: { param?: string };
  };
  if (stripeError.type === "StripeAuthenticationError")
    return messages.invalidKey;
  if (stripeError.code === "secret_key_required") return messages.invalidKey;
  if (stripeError.code === "resource_missing") return messages.missingPrice;
  if (stripeError.param === "customer" || stripeError.raw?.param === "customer")
    return messages.invalidCustomer;
  if (stripeError.type === "StripeInvalidRequestError")
    return messages.invalidRequest;
  return messages.failed;
}

function checkoutResponse(request: Request, url: string) {
  if (
    wantsStripeCheckoutRedirect({
      accept: request.headers.get("accept"),
      contentType: request.headers.get("content-type"),
    })
  ) {
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json({ url });
}

async function clearPendingCheckoutSession(userId: string, sessionId: string) {
  await prisma.user.updateMany({
    where: { id: userId, stripeCheckoutSessionId: sessionId },
    data: { stripeCheckoutSessionId: null },
  });
}

async function assertCheckoutPrice(client: Stripe) {
  const priceId = env.stripePremiumPriceId;
  if (!priceId) throw new StripeConfigError(messages.missingPriceEnv);

  const price = await client.prices.retrieve(priceId);
  const validationError = validatePremiumStripePrice(
    price,
    PREMIUM_MONTHLY_PRICE_YEN,
  );
  if (validationError === "inactive")
    throw new StripeConfigError(messages.inactivePrice);
  if (validationError === "not_recurring")
    throw new StripeConfigError(messages.invalidRequest);
  if (validationError === "not_monthly")
    throw new StripeConfigError(messages.notMonthly);
  if (validationError === "wrong_currency")
    throw new StripeConfigError(messages.wrongCurrency);
  if (validationError === "wrong_amount")
    throw new StripeConfigError(messages.wrongAmount);
  if (validationError === "metered")
    throw new StripeConfigError(messages.meteredPrice);
  return price;
}

async function createCustomer(
  client: Stripe,
  user: Pick<CheckoutUser, "id" | "email" | "name">,
  lockToken: string,
) {
  const customer = await client.customers.create(
    {
      email: user.email,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    },
    {
      idempotencyKey: `subsc-customer-${user.id}-${lockToken}`,
    },
  );
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

async function ensureCustomer(
  client: Stripe,
  user: CheckoutUser,
  lockToken: string,
) {
  if (!user.stripeCustomerId) return createCustomer(client, user, lockToken);

  try {
    const customer = await client.customers.retrieve(user.stripeCustomerId);
    if (
      !customer.deleted &&
      storedStripeCustomerCanBelongToUser(customer.metadata.userId, user.id)
    ) {
      await syncStripeCustomerProfile(client, customer.id, user);
      return user.stripeCustomerId;
    }
  } catch (error) {
    const stripeError = error as {
      code?: string;
      param?: string;
      raw?: { param?: string };
    };
    if (
      stripeError.code !== "resource_missing" &&
      stripeError.param !== "customer" &&
      stripeError.raw?.param !== "customer"
    ) {
      throw error;
    }
  }

  throw new StripeConfigError(messages.invalidCustomer, 409);
}

async function customerSubscriptionState(client: Stripe, user: CheckoutUser) {
  if (!user.stripeCustomerId) {
    return { trialUsedAt: user.trialUsedAt, existingSubscription: null };
  }
  const subscriptions = await client.subscriptions.list({
    customer: user.stripeCustomerId,
    status: STRIPE_SUBSCRIPTION_STATUS_ALL,
    limit: STRIPE_TRIAL_LOOKBACK_SUBSCRIPTION_LIMIT,
  });
  let trialUsedAt = user.trialUsedAt;
  if (!trialUsedAt && subscriptions.data.some(hasStripeTrial)) {
    trialUsedAt = new Date();
    await prisma.user.updateMany({
      where: { id: user.id, trialUsedAt: null },
      data: { trialUsedAt },
    });
  }
  return {
    trialUsedAt,
    existingSubscription:
      subscriptions.data.find((subscription) =>
        stripeSubscriptionCanBeManaged(subscription.status),
      ) ?? null,
  };
}

export async function POST(request: Request) {
  const access = await getVerifiedApiUser();
  if (!access.ok) return access.response;
  const { user } = access;
  let confirmWithoutTrial = false;
  if (
    (request.headers.get("content-type") ?? "").includes("application/json")
  ) {
    const body = await readJsonBodyWithLimit(
      request,
      MAX_BILLING_REQUEST_BODY_BYTES,
    );
    if (!body.ok) {
      const tooLarge = body.reason === "too_large";
      return NextResponse.json(
        {
          message: tooLarge
            ? "リクエストが大きすぎます。入力内容を確認してください。"
            : "入力内容を確認してください。",
        },
        { status: tooLarge ? 413 : 400 },
      );
    }

    const parsedRequest = checkoutRequestSchema.safeParse(body.value);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { message: "入力内容を確認してください。" },
        { status: 400 },
      );
    }
    confirmWithoutTrial = parsedRequest.data.confirmWithoutTrial;
  }
  const rateLimited = billingRateLimitResponse(user.id, "checkout");
  if (rateLimited) return rateLimited;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser)
    return NextResponse.json(
      { message: messages.userNotFound },
      { status: 404 },
    );

  try {
    const client = stripe();
    if (dbUser.stripeCheckoutSessionId) {
      let pendingSession: Stripe.Checkout.Session | null = null;
      try {
        pendingSession = await client.checkout.sessions.retrieve(
          dbUser.stripeCheckoutSessionId,
        );
      } catch (error) {
        const stripeError = error as { code?: string };
        if (stripeError.code !== "resource_missing") throw error;
        return NextResponse.json(
          { message: messages.invalidCheckoutSession },
          { status: 409 },
        );
      }

      if (pendingSession) {
        const sessionCustomerId =
          typeof pendingSession.customer === "string"
            ? pendingSession.customer
            : pendingSession.customer?.id;
        if (
          pendingSession.metadata?.userId !== dbUser.id ||
          !sessionCustomerId ||
          sessionCustomerId !== dbUser.stripeCustomerId
        ) {
          console.error(
            "Stored Stripe Checkout session ownership check failed.",
          );
          return NextResponse.json(
            {
              message:
                "Stripeの申込み状態を確認できませんでした。サポートへお問い合わせください。",
            },
            { status: 409 },
          );
        }
        if (pendingSession.status === "open" && pendingSession.url) {
          return checkoutResponse(request, pendingSession.url);
        }
        if (pendingSession.status === "complete") {
          const synced = await syncStripeCheckoutSession(pendingSession);
          if (!synced) {
            return NextResponse.json(
              {
                message:
                  "決済済みの申込み状態を確認できませんでした。重複課金を防ぐため、新しい申込みは作成していません。サポートへお問い合わせください。",
              },
              { status: 409 },
            );
          }
          await clearPendingCheckoutSession(dbUser.id, pendingSession.id);
          return NextResponse.json(
            { message: messages.alreadySubscribed },
            { status: 409 },
          );
        }
      }
      await clearPendingCheckoutSession(
        dbUser.id,
        dbUser.stripeCheckoutSessionId,
      );
    }

    const now = new Date();
    const lockToken =
      dbUser.stripeCheckoutLockToken &&
      dbUser.stripeCheckoutLockUntil &&
      dbUser.stripeCheckoutLockUntil <= now
        ? dbUser.stripeCheckoutLockToken
        : randomUUID();
    const lockUntil = new Date(now.getTime() + STRIPE_CHECKOUT_LOCK_TTL_MS);
    const lock = await prisma.user.updateMany({
      where: {
        id: dbUser.id,
        OR: [
          { stripeCheckoutLockUntil: null },
          { stripeCheckoutLockUntil: { lt: new Date() } },
        ],
      },
      data: {
        stripeCheckoutLockToken: lockToken,
        stripeCheckoutLockUntil: lockUntil,
      },
    });
    if (lock.count !== 1) {
      return NextResponse.json(
        { message: "Premiumの申込み処理中です。完了するまでお待ちください。" },
        { status: 409 },
      );
    }

    let retainLock = false;
    try {
      const price = await assertCheckoutPrice(client);
      let trialUsedAt = dbUser.trialUsedAt;
      if (
        !trialUsedAt &&
        shouldCheckHistoricalTrialByEmail(env.stripeTestMode) &&
        (await hasHistoricalTrialByEmail(client, dbUser.email))
      ) {
        if (!confirmWithoutTrial) {
          return NextResponse.json(
            { code: "TRIAL_ALREADY_USED", message: messages.historicalTrial },
            { status: 409 },
          );
        }
        trialUsedAt = new Date();
        await prisma.user.updateMany({
          where: { id: dbUser.id, trialUsedAt: null },
          data: { trialUsedAt },
        });
      }
      // Keep the provider idempotency key reserved for customer creation too;
      // a network timeout can leave the provider-side result unknown.
      retainLock = true;
      let customerId: string;
      try {
        customerId = await ensureCustomer(client, dbUser, lockToken);
      } catch (error) {
        if (error instanceof StripeConfigError) retainLock = false;
        throw error;
      }
      const subscriptionState = await customerSubscriptionState(client, {
        ...dbUser,
        stripeCustomerId: customerId,
        trialUsedAt,
      });
      if (subscriptionState.existingSubscription) {
        await syncStripeSubscription(subscriptionState.existingSubscription);
        retainLock = false;
        return NextResponse.json(
          {
            message: hasPremiumStripeStatus(
              subscriptionState.existingSubscription.status,
            )
              ? messages.alreadySubscribed
              : messages.existingSubscriptionNeedsAttention,
          },
          { status: 409 },
        );
      }
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
        {
          metadata: { userId: dbUser.id, plan: "PREMIUM" },
          ...stripeTrialCheckoutData(subscriptionState.trialUsedAt),
        };

      const session = await client.checkout.sessions.create(
        {
          mode: "subscription",
          customer: customerId,
          line_items: [{ price: price.id, quantity: 1 }],
          success_url: `${env.appUrl}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${env.appUrl}/billing?checkout=cancelled`,
          allow_promotion_codes: true,
          metadata: { userId: dbUser.id, plan: "PREMIUM" },
          subscription_data: subscriptionData,
        },
        {
          idempotencyKey: `subsc-checkout-${dbUser.id}-${lockToken}`,
        },
      );

      if (!session.id || !session.url) {
        throw new Error("Stripe Checkout URL was not returned.");
      }

      const storedSession = await prisma.user.updateMany({
        where: { id: dbUser.id, stripeCheckoutLockToken: lockToken },
        data: {
          stripeCheckoutSessionId: session.id,
          stripeCheckoutLockToken: null,
          stripeCheckoutLockUntil: null,
        },
      });
      if (storedSession.count !== 1) {
        throw new Error("Stripe Checkout reservation was lost.");
      }
      retainLock = false;
      return checkoutResponse(request, session.url);
    } finally {
      if (!retainLock) {
        await prisma.user.updateMany({
          where: { id: dbUser.id, stripeCheckoutLockToken: lockToken },
          data: {
            stripeCheckoutLockToken: null,
            stripeCheckoutLockUntil: null,
          },
        });
      }
    }
  } catch (error) {
    console.error("Stripe checkout creation failed.");
    return NextResponse.json(
      { message: checkoutErrorMessage(error) },
      { status: error instanceof StripeConfigError ? error.status : 500 },
    );
  }
}
