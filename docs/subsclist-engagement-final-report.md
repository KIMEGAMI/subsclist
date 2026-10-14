# SubscList 利用頻度・費用対効果分析 最終レポート

最終確認日: 2026-08-13

注記: 本レポートは2026-08-13時点の記録です。料金に関する記載は当時の案内で、現行料金を示すものではありません。現在の料金は公開料金ページと`src/lib/app-constants.ts`を参照してください。

## 結論

仕様書の PHASE 1〜16 は実装・テスト済みです。既存の認証、サブスク管理、支払い管理、通知、CSV、Stripe、Free / Premium 制御を残したまま、利用頻度と費用対効果を判断する機能を追加しました。

## 実装した機能

- 日別利用実績の記録・取消、日／週／月／30日／90日／365日の集計
- 月額換算と1利用日あたりコスト（利用0日は算出不可）
- 理由を表示する0〜100の健康スコア
- 今月・30日・60日・90日の未使用判定
- カテゴリ重複、カテゴリ月額・年額、低利用契約の抽出
- 理由付き解約候補、月間・年間削減可能額
- 月次断捨離チャレンジ、回答履歴、削減実績、控えめな達成表示
- 月額予算、残額・超過額、新規登録・編集時の予算警告
- DBを変更しない入替シミュレーター
- 料金変更前の条件を残す価格履歴と値上げ分析
- 「今日のSubscList」KPIとワンタップ利用記録
- 日次入力がない契約だけを対象にした週次利用確認
- 既存通知基盤への未使用、予算超過、値上げ、週次確認、月次チャレンジ通知の追加
- Free / Premium のサーバー側権限制御と、当時の月額980円の案内
- モバイル最適化、manifest、インストール導線、Service Worker
- CSRF、認証メール・課金APIのレート制限、署名付きセッション、入力検証、IDOR対策の強化

## 主な変更ファイル

- `prisma/schema.prisma`
- `src/components/real-views.tsx`
- `src/components/real-forms.tsx`
- `src/components/subscription-simulator.tsx`
- `src/app/api/subscriptions/[id]/usage/today/route.ts`
- `src/app/api/subscriptions/[id]/usage/weekly/route.ts`
- `src/app/api/saving-challenges/route.ts`
- `src/app/api/notifications/send/route.ts`
- `src/app/api/settings/budget/route.ts`
- `src/lib/subscription-usage.ts`
- `src/lib/subscription-cost.ts`
- `src/lib/subscription-health.ts`
- `src/lib/subscription-unused.ts`
- `src/lib/subscription-duplicates.ts`
- `src/lib/subscription-cancellation-candidates.ts`
- `src/lib/subscription-savings.ts`
- `src/lib/subscription-simulation.ts`
- `src/lib/subscription-weekly-review.ts`
- `src/lib/notification-schedule.ts`
- `src/lib/engagement-notifications.ts`
- `src/lib/api-auth.ts`
- `src/lib/csrf.ts`
- `src/proxy.ts`
- `.github/workflows/ci.yml`

各ドメインロジックには同名の `*.test.ts` を用意し、認証、CSV、Stripe、通知、CSRFの回帰テストもテストスイートへ統合しています。

## 主な新規ファイル

- `prisma/migrations/20260810010000_add_subscription_usage/migration.sql`
- `prisma/migrations/20260811010000_add_saving_challenge/migration.sql`
- `prisma/migrations/20260812010000_add_subscription_price_history/migration.sql`
- `prisma/migrations/20260812040000_add_price_history_custom_cycle_days/migration.sql`
- `prisma/migrations/20260813040000_add_weekly_usage_reviews/migration.sql`
- `prisma/migrations/20260813050000_add_saving_challenge_foreign_keys/migration.sql`
- `src/app/api/subscriptions/[id]/usage/weekly/route.ts`
- `src/components/pwa-install-button.tsx`
- `src/components/pwa-service-worker.tsx`
- `src/lib/subscription-savings.ts`
- `src/lib/subscription-savings.test.ts`
- `src/lib/subscription-simulation.ts`
- `src/lib/subscription-simulation.test.ts`
- `scripts/test-multi-user-isolation.cjs`

## DB変更

### 新規テーブル

- `SubscriptionUsage`
- `SavingChallenge`
- `SubscriptionPriceHistory`
- `WeeklyUsageReview`

### 新規カラム・型

- `SubscriptionPriceHistory.customCycleDays`
- `WeeklyUsageRange` enum（`ZERO`、`ONE_TWO`、`THREE_FIVE`、`SIX_SEVEN`）

### UNIQUE制約

- `SubscriptionUsage(userId, subscriptionId, usedDate)`
- `SavingChallenge(userId, year, month)`
- `WeeklyUsageReview(userId, subscriptionId, weekStart)`

### INDEX

- 利用日、週開始日、価格適用日、サブスクID、ユーザーIDを対象に検索用INDEXを追加

### Foreign Key

- `SubscriptionUsage` → `User` / `Subscription`（CASCADE）
- `SubscriptionPriceHistory` → `User` / `Subscription`（CASCADE）
- `WeeklyUsageReview` → `User` / `Subscription`（CASCADE）
- `SavingChallenge` → `User` / `Subscription`（CASCADE）

## 削除

- 既存DBレコード削除: 0
- 既存テーブル削除: 0
- 既存カラム削除: 0
- 既存機能の置換・簡略化: 0

## 最終テスト

- Unit / regression: 71件成功
- TypeScript: `npx tsc --noEmit` 成功
- Lint: `npm run lint` 成功
- Build: `npm run build` 成功（Next.js 16.3.0、74ルート）
- Prisma: 全21マイグレーション適用済み、DB schemaは最新
- Multi-user isolation: 7種類の所有データで相互参照不可を確認
- npm audit: 本番依存関係の既知脆弱性0件
- Browser smoke: 主要9画面、ログアウト、公開トップ、一般デモログインを確認
- Browser console: 警告・エラー0件
- Responsive smoke: 主要画面の横スクロールなし
- DB維持確認: users 6件、subscriptions 17件、payments 207件を維持

## 既知の制約

- Google OAuth、SMTP送信、Stripe Checkout / Webhookは外部サービスの実アカウントと本番シークレットが必要なため、今回のローカル最終監査では実課金・実送信を発生させるE2Eを実行していません。入力検証、署名検証、権限制御、同期ロジックは自動テスト済みです。
- Service Workerは認証済みデータの陳腐化を避けるため、画面やAPIをキャッシュしません。インストール可能性と将来拡張の土台に限定しています。
- iOS Safariを含む実機確認は別途必要です。
- 作業ツリーには未コミット変更があります。公開前は `master` へ直接pushせず、`codex/` ブランチでレビューとCIを通す必要があります。
