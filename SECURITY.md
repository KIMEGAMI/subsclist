# Security Policy

## 対象範囲

SubscList の本番運用に関わる以下をセキュリティ確認の対象にします。

- Next.js アプリケーションコード: `src/`
- API ルート: `src/app/api/`
- 認証、セッション、CSRF、メール、Stripe 連携: `src/lib/`
- Prisma スキーマと migration: `prisma/`
- CI / セキュリティ設定: `.github/workflows/`, `.semgrep.yml`
- デプロイ、PM2、cron などの運用手順: `docs/`, `ecosystem.config.cjs`

## 重点的に確認する脅威

- 認証回避、セッション改ざん、権限昇格
- ユーザー間のデータ参照漏れ
- CSRF、XSS、CSV / spreadsheet injection
- SQL injection、Prisma raw query の不適切利用
- Stripe 顧客 ID / Subscription ID の取り違え
- Webhook 署名検証漏れ
- パスワード再設定、メール認証、メール変更トークンの再利用
- 秘密情報、API key、個人情報のログ出力やコミット混入
- 管理者機能、メンテナンスモード、一斉メール機能の悪用

## Codex Security の運用

Codex Security は GitHub リポジトリに接続して利用します。スキャン結果の修正案は自動適用せず、必ずPull Requestとしてレビューします。

1. Codex Security でこのリポジトリを有効化する。
2. 初回スキャン後、生成された threat model を `docs/codex-security.md` の内容と照合する。
3. High / Critical 相当の finding は本番デプロイ前に対応する。
4. 修正PRでは既存のCI、Security workflow、必要な手動確認を通す。
5. 誤検知と判断した場合も、理由をPRまたはIssueに残す。

## セキュリティ修正時の必須確認

- `npm run lint`
- `npm test`
- `npm run test:isolation`
- `npm run audit:stripe`
- `npm run build`
- `npm audit --audit-level=high`

## 秘密情報の扱い

- `.env` や本番シークレットはコミットしない。
- Stripe、SMTP、DB、認証シークレットは必ず環境変数で管理する。
- 誤って秘密情報をコミットした場合は、削除だけでなくキーのローテーションを行う。

## 一時的な依存関係 override

`package.json` の override は、上流パッケージが修正版へ更新されるまでの明示的な安全対策です。Prisma更新時に解除条件を確認し、不要になった固定は削除します。

- `mariadb` → 直接依存の修正版を参照: `@prisma/adapter-mariadb@7.9.1` が脆弱な `mariadb@3.4.5` を固定しているため。`GHSA-cqhc-2h57-wpxf`、`GHSA-42r5-vhpq-m858`、`GHSA-g5xc-5w98-jfvm`への対応。アダプターが修正版を依存するリリースへ更新されたら解除する。
- `@prisma/config` 配下の `deepmerge-ts` → `8.0.2`: `@prisma/config@7.9.1` が `7.1.5` を固定しているため。`GHSA-ggr8-5vv4-36mx`への対応。Prismaが`deepmerge-ts >= 8.0.0`を採用したら解除する。

override変更時は、`npm ls`で不正な依存がないこと、`npm audit --audit-level=high`、Prisma Client生成、全テスト、本番ビルドを確認します。

## 報告と対応

このリポジトリで脆弱性が見つかった場合は、公開Issueに詳細な攻撃手順や秘密情報を書かず、管理者に直接共有してください。
