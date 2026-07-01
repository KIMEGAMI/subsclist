# SubscList 本番デプロイ手順

この手順は Next.js + Prisma + MySQL 構成の SubscList を本番環境へデプロイするためのものです。
本番DBに対して `prisma migrate dev` や `prisma migrate reset` は実行しないでください。本番では必ず `npm run prisma:deploy` を使います。

## 1. 事前準備

本番サーバー、または Vercel などのホスティング環境で以下を用意します。

- Node.js 20 以上
- MySQL 8.0 以上、または互換DB
- GitHub リポジトリ: `https://github.com/KIMEGAMI/subsclist`
- Google SMTP 用の Gmail アプリパスワード
- OpenAI API key
- Stripe 本番キー、Webhook secret、Premium プランの Price ID

## 2. 本番用の環境変数

`.env.example` を基準に、本番環境へ以下を設定します。
Vercel の場合は Project Settings の Environment Variables に登録してください。
セルフホストの場合はアプリの配置先に `.env` を作成します。

```env
DATABASE_URL="mysql://user:password@host:3306/subsclist"
APP_URL="https://your-domain.example"
NEXTAUTH_URL="https://your-domain.example"
NEXTAUTH_SECRET="32文字以上のランダム文字列"
AUTH_SECRET="32文字以上のランダム文字列"

MAIL_FROM="SubscList <your-gmail-address@gmail.com>"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-gmail-address@gmail.com"
SMTP_PASS="Googleのアプリパスワード"

OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4.1-mini"

STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."

DEMO_USER_EMAIL="user@shinji.work"
NOTIFICATION_JOB_SECRET="十分に長いランダム文字列"
```

`APP_URL` と `NEXTAUTH_URL` は、必ず実際に公開する HTTPS のURLにしてください。メール認証URLやログイン後の遷移に使われます。

## 3. デプロイ前のローカル確認

本番へ反映する前に、ローカルで以下を確認します。

```bash
npm install
npm run lint
npm run build
```

`npm run build` generates Prisma Client before the Next.js build. During generation only, it uses a fallback URL when `DATABASE_URL` is not set. `npm run prisma:deploy` still requires the production `DATABASE_URL`.

## 4. Vercel にデプロイする場合

1. Vercel で GitHub リポジトリ `KIMEGAMI/subsclist` を Import します。
2. Framework Preset は Next.js を選択します。
3. Environment Variables に「2. 本番用の環境変数」を登録します。
4. Build Command は通常どおり `npm run build` を使用します。
5. Install Command は `npm install` を使用します。
6. 初回デプロイ前、またはデプロイ後に本番DBへマイグレーションを適用します。

Vercel の Build Command でDBマイグレーションまで自動実行したい場合は、以下のように設定できます。

```bash
npm run prisma:deploy && npm run build
```

ただし、複数環境や複数デプロイが同時に走る可能性がある場合は、CI/CD または手動で `npm run prisma:deploy` を1回だけ実行する運用の方が安全です。

## 5. セルフホストでデプロイする場合

サーバー上で以下を実行します。

```bash
git clone https://github.com/KIMEGAMI/subsclist.git
cd SubscList
npm install
npm run prisma:deploy
npm run build
npm run start
```

標準では `npm run start` は port 3000 で起動します。必要に応じてリバースプロキシで HTTPS 化してください。

PM2 を使う場合の例です。

```bash
npm install -g pm2
pm2 start npm --name subsclist -- run start
pm2 save
```

## 6. Stripe settings

Stripe Checkout, Customer Portal, and Webhook routes are implemented.
Create a JPY 480 monthly Price in Stripe Dashboard and set it as `STRIPE_PREMIUM_PRICE_ID`.

Webhook endpoint:

```text
https://your-domain.example/api/stripe/webhook
```

Enable these Stripe events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
Set the signing secret as `STRIPE_WEBHOOK_SECRET`.

## 7. 定期通知の実行

通知送信APIを cron から呼び出す場合は、`NOTIFICATION_JOB_SECRET` を付けて実行します。

```bash
curl -X POST "https://your-domain.example/api/notifications/send" \
  -H "Authorization: Bearer your-notification-job-secret"
```

Vercel Cron、GitHub Actions、サーバーの cron など、運用環境に合わせて1日1回程度で設定してください。

## 8. デプロイ後の確認

デプロイ後は以下を確認します。

- `/` が表示できる
- `/login` からログインできる
- 新規登録後、Google SMTP から認証メールが届く
- メール認証URLで認証が完了する
- `/dashboard`、`/subscriptions`、`/calendar` がログイン後に表示できる
- サブスク登録、編集、削除ができる
- AI診断で OpenAI API エラーが出ない
- Premium 関連機能を使う場合、Stripe の本番決済が動作する

## 9. 本番DB運用の注意

本番DBでは以下を実行しないでください。

```bash
npm run prisma:migrate
npx prisma migrate dev
npx prisma migrate reset
```

本番DBの更新は以下のみを使います。

```bash
npm run prisma:deploy
```

マイグレーション前には、DBバックアップを取得してください。
