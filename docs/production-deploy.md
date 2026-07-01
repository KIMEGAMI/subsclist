# SubscList Production Deploy

This guide is for deploying SubscList with Next.js, Prisma, MySQL, Google SMTP, OpenAI, and Stripe.

Do not run development migration commands against production. Use `npm run prisma:deploy` for production database migrations.

## 1. Requirements

- Node.js 20 or later
- MySQL 8.0 or compatible database
- GitHub repository: https://github.com/KIMEGAMI/subsclist
- Gmail app password for SMTP
- OpenAI API key
- Stripe secret key, webhook secret, and Premium Price ID

## 2. Environment Variables

Create `.env` on the server or register these values in the hosting provider.

```env
DATABASE_URL="mysql://user:password@host:3306/subsclist"
APP_URL="https://your-domain.example"
NEXTAUTH_URL="https://your-domain.example"
NEXTAUTH_SECRET="at-least-32-random-characters"
AUTH_SECRET="at-least-32-random-characters"

MAIL_FROM="SubscList <your-gmail-address@gmail.com>"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-gmail-address@gmail.com"
SMTP_PASS="your-google-app-password"

OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4.1-mini"

STRIPE_SECRET_KEY="sk_live_or_sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."

DEMO_USER_EMAIL="user@shinji.work"
NOTIFICATION_JOB_SECRET="long-random-secret"
```

`APP_URL` and `NEXTAUTH_URL` must be the public HTTPS URL of the service.

## 3. Build Check

```bash
npm install
npm run lint
npm run build
```

`npm run build` runs Prisma Client generation before the Next.js build. `npm run prisma:deploy` always requires the real production `DATABASE_URL`.

## 4. Self-host Deploy

```bash
git clone https://github.com/KIMEGAMI/subsclist.git
cd subsclist
npm install
npm run prisma:deploy
npm run build
npm run start
```

The default Next.js port is 3000. Put Apache or Nginx in front of it for HTTPS.

With PM2:

```bash
sudo npm install -g pm2
pm2 start npm --name subsclist -- run start
pm2 save
```

## 5. Stripe Billing

Stripe Checkout, Customer Portal, and Webhook routes are implemented.

Create a JPY 480 monthly Price in Stripe Dashboard and set it as `STRIPE_PREMIUM_PRICE_ID`.

Webhook endpoint:

```text
https://your-domain.example/api/stripe/webhook
```

Enable these Stripe events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Set the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`.

### Stripe Test Mode

Before using live keys, run a full test checkout.

1. Turn on test mode in Stripe Dashboard.
2. Create a test JPY 480 monthly Price.
3. Set `STRIPE_SECRET_KEY` to `sk_test_...`.
4. Set `STRIPE_PREMIUM_PRICE_ID` to the test `price_...`.
5. Set `STRIPE_WEBHOOK_SECRET` from the test webhook endpoint.
6. Open SubscList Settings and click `Upgrade to Premium`.
7. In Stripe Checkout, use card `4242 4242 4242 4242`.

Use any future expiry date, any 3-digit CVC, and any name/address/ZIP. No real charge is created in test mode.

## 6. Notification Job

```bash
curl -X POST "https://your-domain.example/api/notifications/send" \
  -H "Authorization: Bearer your-notification-job-secret"
```

## 7. Post-deploy Checks

- `/` opens correctly
- `/login` works
- Registration sends a Google SMTP verification email
- Email verification completes
- Authenticated pages such as `/dashboard`, `/subscriptions`, and `/calendar` load
- Subscription create, edit, and delete work
- OpenAI recommendations work when `OPENAI_API_KEY` is set
- Stripe test checkout completes and the webhook updates the user to Premium

## 8. Production Database Safety

Do not run these commands against production:

```bash
npm run prisma:migrate
npx prisma migrate dev
npx prisma migrate reset
```

Use only:

```bash
npm run prisma:deploy
```

Take a database backup before applying migrations.
