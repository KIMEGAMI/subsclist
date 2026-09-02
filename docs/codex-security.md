# Codex Security 導入手順

## 結論

SubscList では、GitHub Actions の静的検査と自動テストに加えて、Codex Security でリポジトリ全体の脅威モデル作成、脆弱性検証、修正案レビューを行います。

Codex Security はローカルファイルを追加するだけでは有効化されません。ChatGPT / Codex 側で GitHub リポジトリを接続し、対象リポジトリを有効化してください。

公式情報:

- https://help.openai.com/en/articles/20001107-codex-security
- https://openai.com/daybreak/codex-security-plugin/

## 導入手順

1. ChatGPT / Codex にログインする。
2. Codex Security plugin を追加する。
3. `Try in chat` からスキャンを開始する。
4. 対象フォルダまたはGitHubリポジトリとして SubscList を選択する。
5. GitHub連携で `shinji.work` / SubscList の本番リポジトリを有効化する。
6. 初回スキャンの threat model を確認し、このファイルの「SubscListの脅威モデル」と差分を直す。
7. finding が出た場合は、修正案を直接適用せず Pull Request として確認する。
8. 修正PRは CI と Security workflow が成功してから merge する。

## SubscList の脅威モデル

### 重要資産

- ユーザーのメールアドレス、名前、認証状態
- パスワードハッシュ
- セッションCookieと署名キー
- Stripe customer / subscription / price ID
- サブスク情報、支払い履歴、解約期限、利用記録
- 管理者権限、管理者メニュー、一斉メール機能
- SMTP、DB、Stripe、OAuth、通知ジョブのシークレット

### 信頼境界

- ブラウザから Next.js API へのリクエスト
- 認証済みユーザーと管理者ユーザーの境界
- Free / Premium の権限境界
- Stripe Checkout / Portal / Webhook とアプリDBの境界
- Google OAuth callback とアプリセッションの境界
- メンテナンスモード中の一般ユーザーと管理者の境界
- CSV import / export と表計算ソフトの境界
- 管理者一斉メールの入力内容とSMTP送信処理の境界

### 優先して確認する攻撃経路

- 一般ユーザーが他ユーザーの subscription / payment history を参照、変更できないか。
- Free ユーザーが Premium 機能や件数制限を回避できないか。
- Stripe webhook の署名なしリクエストでプランを変更できないか。
- Stripe customer ID の取り違えで他人の契約・解約画面を開けないか。
- CSRFで設定変更、解約候補、メール変更、パスワード変更を実行できないか。
- `dangerouslySetInnerHTML`、DOM HTML sink、CSV formula injection でXSSや情報流出が起きないか。
- パスワード再設定、メール認証、メール変更トークンを再利用できないか。
- 管理者以外が管理者API、一斉メール、メンテナンス切替を実行できないか。
- メンテナンスモード中に一般ユーザーがダッシュボードやAPIへ到達できないか。
- エラー表示やログにスタックトレース、メールアドレス、環境変数、API key が出ないか。

## 既存の自動防御

GitHub Actions:

- `.github/workflows/ci.yml`
  - lint
  - unit / security tests
  - multi-user data isolation test
  - Stripe identifier audit
  - production build
  - npm audit

- `.github/workflows/security.yml`
  - Dependency Review
  - CodeQL
  - Semgrep
  - Gitleaks

Semgrep custom rules:

- XSSにつながる `dangerouslySetInnerHTML`
- DOM HTML sink
- dynamic code execution
- Prisma unsafe raw query
- `process.env` のログ出力
- Stripe live key のソース混入

## finding 対応ルール

- Critical / High: 本番デプロイ前に対応する。
- Medium: リスクを確認し、影響範囲がユーザーデータ、課金、認証に触れる場合は優先対応する。
- Low: 誤検知か改善タスクかを明記して管理する。
- すべての修正で既存機能のデグレードを避けるため、関連テストを追加または更新する。

## スキャン前に確認するコマンド

```powershell
cd C:\MyDeveloper\SubscList
npm run lint
npm test
npm run test:isolation
npm run audit:stripe
npm run build
npm audit --audit-level=high
```

## Codex Security に渡す推奨プロンプト

```text
このリポジトリは SubscList という Next.js / Prisma / MariaDB / Stripe Billing のSaaSです。
ユーザーのサブスク、支払い履歴、Stripe契約状態、管理者機能を扱います。
特に認証、権限分離、CSRF、XSS、Stripe webhook、ユーザー間データ漏洩、管理者API、メンテナンスモード、一斉メール機能を重点的に調査してください。
既存の docs/codex-security.md と SECURITY.md を脅威モデルの前提として使ってください。
finding は再現性、影響、修正案、必要なテストをセットで提示してください。
```