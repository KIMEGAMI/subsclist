# サブスクリスト

サブスクリストは、契約しているサブスクリプションを一元管理し、月額費用、年間費用、更新日、支払い方法、カテゴリ別支出を可視化する Next.js アプリケーションです。

## 使用技術

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- MySQL
- NextAuth.js / Auth.js 想定
- Stripe 想定

## 実装済み機能

- LP、料金ページ、ログイン、会員登録、メール認証案内
- DB連携ログイン、会員登録、Google SMTPによるメール認証送信
- ダッシュボード KPI、更新予定、カテゴリ別集計
- サブスクリプション登録、一覧、詳細、編集、論理削除、解約済み更新
- カテゴリ管理、支払い方法管理
- 分析、カレンダー、支払い確認、支払い累計、通知設定、CSV出力、設定
- サブスク詳細画面でのOpenAI Responses APIによるAI乗り換え提案
- Free/Premium 制限の動作確認
- Prisma の MySQL スキーマ

## 画面一覧

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
- `/categories`
- `/payment-methods`
- `/payments`
- `/payment-totals`
- `/notifications`
- `/export`
- `/settings`

## セットアップ

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## 環境変数

`.env.example` を参照してください。秘密情報を Git 管理しないでください。

Google SMTPを使う場合は、Googleアカウントで2段階認証を有効にし、アプリパスワードを発行して `SMTP_PASS` に設定します。

```env
APP_URL="http://localhost:3000"
MAIL_FROM="SubscList <your-gmail-address@gmail.com>"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="your-gmail-address@gmail.com"
SMTP_PASS="your-google-app-password"
```

AI提案を使う場合は、OpenAI APIキーを設定します。最新候補の調査にResponses APIのWeb検索を使います。

```env
OPENAI_API_KEY="sk-proj-replace"
OPENAI_MODEL="gpt-5.5"
```

## DB マイグレーション

MySQL を用意し、`DATABASE_URL` を設定してから実行します。

```bash
npm run prisma:migrate
```

## テスト方法

```bash
npm run lint
npm run build
```

`npm run build` は `prisma generate` を実行してから Next.js をビルドします。

## デプロイ

Vercel などの Next.js 対応環境にデプロイできます。MySQL、Stripe、メール配信の本番環境変数を設定してください。

本番環境への具体的なデプロイ手順は [docs/production-deploy.md](docs/production-deploy.md) を参照してください。

## 今後の改善予定

- NextAuth.js の永続セッション連携
- Stripe Checkout / Webhook 実処理
- メール送信基盤との接続
- Prisma を使った CRUD API の永続化
- Playwright による E2E テスト
