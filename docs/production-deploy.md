# SubscList Production Deploy

This guide is for deploying SubscList with Next.js, Prisma, MySQL, Resend, and Stripe.

Do not run development migration commands against production. Use `npm run prisma:deploy` for production database migrations.

## 1. Requirements

- Node.js 20.19 or later in the 20.x line, 22.12 or later in the 22.x line, or 24 or later (CI uses Node.js 24). `scripts/check-node-version.cjs` checks the locked Prisma requirements before deployment.
- MySQL 8.0 or compatible database
- GitHub repository: https://github.com/KIMEGAMI/subsclist
- A verified sending domain and API key in Resend
- Stripe secret key, webhook secret, and Premium Price ID

## 2. Environment Variables

Create `.env` on the server or register these values in the hosting provider.

```env
DATABASE_URL="mysql://user:password@host:3306/subsclist"
APP_URL="https://subsclist.kimegami.jp"
NEXTAUTH_URL="https://subsclist.kimegami.jp"
AUTH_SECRET=""

RESEND_API_KEY="re_..."
RESEND_FROM="SubscList <noreply@your-verified-domain.example>"
CONTACT_EMAIL="info@kimegami.jp"

STRIPE_SECRET_KEY="your-stripe-secret-key"
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PREMIUM_PRICE_ID="price_..."
STRIPE_PORTAL_CONFIGURATION_ID=""
STRIPE_LIVE_MODE_ALLOWED="true"

DEMO_USER_EMAIL="user@shinji.work"
ADMIN_USER_EMAIL="admin@shinji.work"
NOTIFICATION_JOB_SECRET=""
NEWS_JOB_SECRET=""

# Googleログインを有効にする場合は両方設定。未設定ならログイン画面にボタンは表示されません。
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Gemini分析を使う場合だけ設定
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.6-flash"
```

Resendを使う場合は、Resendで認証済みの送信ドメインを`RESEND_FROM`に指定してください。`RESEND_API_KEY`が設定されているとメール送信にResend APIを使います。SMTPへ切り替える場合のみ、`.env.example`にある`MAIL_FROM`と`SMTP_*`を設定します。問い合わせ先は`CONTACT_EMAIL`で、送信元とは別の設定です。

`APP_URL` and `NEXTAUTH_URL` must be the public HTTPS URL of the service.
`AUTH_SECRET`は32バイト以上のランダム値を設定してください。PowerShell 5互換の生成例です。出力は秘密情報として扱い、チャットやGitへ貼り付けないでください。認証・通知ジョブ・ニュースジョブにはそれぞれ別の値を生成します。

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

`NEXTAUTH_SECRET`は旧設定との互換用です。新規設定では`AUTH_SECRET`だけを使い、説明用の置換文字列は設定しないでください。`NOTIFICATION_JOB_SECRET`と`NEWS_JOB_SECRET`は用途ごとに異なるシークレットにし、Stripeや認証のシークレットを流用しないでください。`NEWS_JOB_SECRET`は既存の公式価格同期cronで使われます。契約ニュースの自動cronは不要です。

`DEMO_USER_PASSWORD`と`ADMIN_USER_PASSWORD`はデモ・管理者のseed実行時だけ必要です。実行環境へ設定し、ソースコードやGitへ保存しないでください。

自動テストはStripeをモックします。テスト実行時はLiveキーを拒否しますが、開発サーバーの手動操作はStripeへ実通信します。開発環境でLiveモードを意図的に検証する場合は、`.env`に`STRIPE_LIVE_MODE_ALLOWED="true"`を設定して開発サーバーを再起動してください。実際の顧客・契約・請求へ影響するため、通常の開発にはテストキーを使ってください。Resendを採用する場合は`RESEND_API_KEY`と検証済み`RESEND_FROM`の両方を本番環境に設定し、SMTP設定だけでResend利用済みと判断しないでください。

## 3. Build Check

```bash
npm ci
npx prisma validate
npm run lint
npx tsc --noEmit
npm test
npm run test:db-guard
npm run test:routes:coverage
npm run test:db-isolation
npm run audit:stripe
npm run test:e2e
npm audit --audit-level=high
npm run build
```

`npm run build` runs Prisma Client generation before the Next.js build. Route, isolation, Stripe-audit, and E2E tests require `TEST_DATABASE_URL` to point to a dedicated local database ending in `_test` or `_ci`; the test runner rejects production database names and non-local hosts. Do not put production credentials into the test environment. `npm run prisma:deploy` is the only migration command for production and requires the production `DATABASE_URL`.

Do not release from a dirty worktree or an unreviewed branch. First preserve and review all local changes, integrate them through the repository's approved pull-request workflow, and deploy the exact tested commit. Never copy the developer's `.env` to production.

## 4. Self-host Deploy

```bash
git clone https://github.com/KIMEGAMI/subsclist.git
cd subsclist
npm ci
```

The commands above only fetch the source. Do not use an unguarded `npm run build`, `npm run prisma:deploy`, or `npm run start` sequence on a production installation. For a new or existing production server, configure the environment and follow the controlled release procedure below; it verifies the backup, maintenance mode, exact commit, migration preflight, build, and health checks before ending maintenance.

For an existing installation, use the following controlled sequence instead of starting a second PM2 process:

1. Confirm the checked-out commit is the approved release and `git status --short` is clean.
2. Take and verify a restorable production database backup. Keep the backup outside the application directory with restricted permissions.
3. Enable the application's maintenance mode and confirm the public site shows maintenance while the administrator remains able to work.
4. Install the lockfile dependencies with `npm ci`, validate the production environment variables without printing their values, and build the approved commit.
5. Confirm `DATABASE_URL` targets the intended production database, then run `npx prisma migrate status` to record the current migration state.
6. Review pending SQL before migration. The deploy workflow validates required production environment settings without printing values, installs lockfile dependencies, then runs a read-only migration preflight against the configured production database before Prisma generation, build, or schema changes. It requires application maintenance mode and stops if the manual-alternative migration would discard values, Stripe IDs violate pending unique indexes, the savings-event table or migration history is inconsistent, or migration history is unresolved. The savings-event migration preserves existing rows and backfills dedupe keys automatically; no manual row-count report is required. If blocked, preserve the output and resolve the configuration or data/migration plan before retrying; do not edit an already-applied migration.
7. Apply only `npm run prisma:deploy`, then restart the existing PM2 application once using its configured process name and environment. Do not run `prisma migrate dev`, reset, or `db push` in production.
8. The restart script checks both the loopback health endpoint and the public HTTPS origin configured by `APP_URL` (or `NEXTAUTH_URL`). From an external browser/network, also verify DNS/TLS, the public site, login, subscription, billing, and webhook flows. A server-side request to its own public origin does not replace this external check. Disable maintenance only after the checks pass.

The GitHub production workflow first completes its verification job, records the exact checked-out commit SHA, and deploys that SHA rather than resolving the branch again. The manual dispatch requires an explicit confirmation that a restorable production database backup exists; without it, the production deploy job is skipped. It aborts if the production checkout has tracked or untracked changes. The server-side build must pass before the required production migration step; a failed build therefore does not apply a migration, and an unsuccessful migration prevents PM2 restart. After migrations succeed, the workflow prunes development-only packages before restarting PM2.

Prisma migrations are not automatically rolled back with the application binary. If a migration or post-deploy check fails, keep maintenance enabled and follow the tested database-restore and previous-release procedure; do not attempt an improvised destructive rollback.

The default Next.js port is 3000. The current production instance uses loopback port 3001 behind Apache. Set the GitHub production environment secret `PRODUCTION_APP_PORT=3001`; the deployment workflow applies the same port to PM2 and its health checks. Put Apache or Nginx in front of the app for HTTPS.

Bind Next.js to loopback so clients cannot bypass the reverse proxy. The proxy must discard a client-supplied `X-Forwarded-For` header and set it from the actual connection peer; the application uses the final address in that header for per-client authentication and contact rate limits. Apply a request-body limit at the proxy as well.

For Apache, enable `mod_headers` and apply these directives in the HTTPS virtual host. Keep `RequestHeader` in its default late mode: it removes the caller-supplied value before the proxy handler forwards the request, and `ProxyAddHeaders` then supplies the connection peer address. Apache documents early mode as a test/debug aid, not normal operational use ([mod_headers](https://httpd.apache.org/docs/2.4/mod/mod_headers.html), [mod_proxy](https://httpd.apache.org/docs/2.4/mod/mod_proxy.html)).

```apache
RequestHeader unset X-Forwarded-For
ProxyAddHeaders On
LimitRequestBody 1048576
```

For Nginx, use the equivalent directives in the proxied location:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
client_max_body_size 1m;
```

If Apache is behind another load balancer or proxy, configure `mod_remoteip` to trust only that proxy's known addresses before relying on `REMOTE_ADDR`. Verify the actual virtual host and firewall before release. A proxy that preserves a caller-supplied forwarding header makes IP-based limits unreliable.

With PM2:

```bash
cd /var/www/subsclist
DEPLOY_SHA="<approved-40-character-commit-sha>" \
PRODUCTION_BACKUP_VERIFIED=1 \
APP_DIR=/var/www/subsclist \
APP_NAME=subsclist \
bash scripts/production-restart.sh
```

The restart script refuses a dirty worktree, accepts only `master` or `main`, and deploys only the exact `DEPLOY_SHA` after confirming it belongs to the selected remote branch. With `SKIP_GIT_PULL=1`, the local `HEAD` must already equal that SHA. Do not run a second `pm2 start`; the script reloads the existing named process or starts it from `ecosystem.config.cjs` if it does not exist.

## 5. Stripe Billing

Stripe Checkout, Customer Portal, and Webhook routes are implemented.

Create a JPY 480 monthly Price in Stripe Dashboard and set it as `STRIPE_PREMIUM_PRICE_ID`.

Webhook endpoint:

```text
https://subsclist.kimegami.jp/api/stripe/webhook
```

Enable these Stripe events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

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

Live Stripe keys require `STRIPE_LIVE_MODE_ALLOWED=true` in development or production, and are always rejected in automated test environments. Keep the flag `false` by default. Enabling it locally uses real Stripe customers, subscriptions, invoices, and payment methods; use a test key unless you intentionally need to validate a real billing flow, and use a controlled account/customer with explicit consent. The live Price ID, webhook secret, and portal configuration must all belong to the same Stripe live mode.

## 6. Notification Job

本番`.env`へ`NOTIFICATION_JOB_SECRET`を設定してから実行します。未設定のまま公開せず、crontabのコマンド行へ値を直接書かないでください。具体的な安全な設定例は`docs/notification-cron.md`を参照してください。

```bash
curl -X POST "https://subsclist.kimegami.jp/api/notifications/send" \
  -H "Authorization: Bearer ${NOTIFICATION_JOB_SECRET}"
```

Run this only from a shell where the secret was loaded from a permission-restricted environment file or secret manager. Do not replace the variable with its value in shell history or a crontab entry.

## 7. Post-deploy Checks

- `/` opens correctly
- `/login` works
- Registration sends a Resend verification email
- Email verification completes
- Authenticated pages such as `/dashboard`, `/subscriptions`, and `/calendar` load
- Subscription create, edit, and delete work
- Premium-only viewing and review flows work correctly
- Stripe test checkout completes and the webhook updates the user to Premium
- Notification job secret is configured and the scheduled job records a successful run
- Browser console and server error log remain empty during the main user flow

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
