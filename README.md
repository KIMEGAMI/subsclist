# SubscList

SubscList is a Next.js subscription management app for tracking recurring contracts, renewal dates, payment methods, payment history, analytics, cancellation workflows, and AI-powered switching recommendations.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- MySQL
- Stripe Checkout / Billing Portal / Webhook
- Nodemailer SMTP
- OpenAI Responses API

## Implemented Features

- Landing page, pricing page, login, registration, and email verification
- Database-backed authentication and verified-user access control
- Dashboard KPIs, upcoming renewals, category summaries
- Subscription create/list/detail/edit/delete and cancellation state management
- Category and payment method management
- Calendar view with subscriptions placed on billing dates
- Analytics, review report, monthly report, payment history, and payment totals
- Notification settings and reminder delivery history
- CSV import/export and CSV statement candidate detection
- AI switching recommendation on subscription detail pages
- Free/Premium plan limits
- Stripe Checkout, Customer Portal, and Webhook-based Premium sync
- Demo data seed for production/demo environments

## Pages

- `/`
- `/login`
- `/register`
- `/verify-email`
- `/pricing`
- `/dashboard`
- `/subscriptions`
- `/subscriptions/new`
- `/subscriptions/[id]`
- `/subscriptions/[id]/edit`
- `/calendar`
- `/analytics`
- `/monthly-report`
- `/review`
- `/categories`
- `/payment-methods`
- `/payments`
- `/payment-totals`
- `/notifications`
- `/export`
- `/settings`

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## Required Environment

See `.env.example`. Do not commit secrets.

For Google SMTP, enable 2-step verification on the Google account, create an app password, and set it as `SMTP_PASS`.

For Stripe Premium billing, create a JPY 480 monthly Price and set `STRIPE_PREMIUM_PRICE_ID`. Configure the webhook endpoint at `/api/stripe/webhook`.

## Stripe Test Billing

Use Stripe test keys for a full checkout rehearsal before switching to live mode.

1. In Stripe Dashboard, enable test mode.
2. Create a JPY 480 monthly test Price and set it as `STRIPE_PREMIUM_PRICE_ID`.
3. Set `STRIPE_SECRET_KEY` to a `sk_test_...` key.
4. Configure the webhook endpoint and set `STRIPE_WEBHOOK_SECRET` to the test webhook signing secret.
5. Open Settings, click `Upgrade to Premium`, and use card `4242 4242 4242 4242`.

For the test card, use any future expiry date, any 3-digit CVC, and any name/address/ZIP. Stripe does not create a real charge in test mode.

For AI recommendations, set `OPENAI_API_KEY`.

## Database

For local development:

```bash
npm run prisma:migrate
```

For production:

```bash
npm run prisma:deploy
```

## Verification

```bash
npm run lint
npm run build
```

`npm run build` generates Prisma Client before the Next.js build. During generation only, it uses a fallback URL when `DATABASE_URL` is not set. `npm run prisma:deploy` still requires the production `DATABASE_URL`.

## Production Deploy

See [docs/production-deploy.md](docs/production-deploy.md).

## Demo Data

```bash
npm run seed:demo
```

This creates the demo user, verified email state, Premium plan, sample subscriptions, payment methods, categories, notification settings, payment history from 2025-01 to 2026-06, and cancellation evidence.


## Google OAuth Login

Create an OAuth client in Google Cloud Console and set:

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
```

Authorized redirect URI:

```text
https://your-domain.example/api/auth/google/callback
```

For local development, also add:

```text
http://localhost:3000/api/auth/google/callback
```
