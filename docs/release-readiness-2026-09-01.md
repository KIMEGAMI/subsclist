# SubscList リリース判定

## 2026-10-12 再確認

- 権限付きの読み取り専用確認で、Windowsサービス`MySQL84`がTCP 3306で稼働していることを確認。通常権限の確認ではサービス管理/CIMへのアクセスが拒否されていたため、停止と誤認していた。`.env`の接続先は値を表示せず確認し、`localhost:3306/subsclist`。テストランナーはこれを`localhost:3306/subsclist_test`へ限定して使用し、本番DBには接続しない。
- `npm run test:db-isolation`成功。12種類のユーザー所有データの相互分離、認証トークンの一回取得とロールバック、テスト前後のDB件数維持を確認。
- `npm run test:routes`成功。46ファイル・281件すべて成功。
- `npm run test:e2e`成功。Next.js本番相当ビルド後、Playwrightデスクトップ/モバイルの26件すべて成功。テスト専用アカウントを用い、外部メール・Stripeは無効化。
- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`、`npm run build`も成功。本番ビルドは.envを変更せず、プロセス限定の一時認証シークレットと`.next-release-check`出力先を使用。
- マイグレーションの既存データバックフィル試験は接続スコープの一時テーブルで成功。テストDBのStripe識別子監査は重複0件（このDBにはテストユーザー0件）。
- E2Eビルドが`tsconfig.json`へ自動追加した`.next-e2e`の型パス2件のみ除去。既存の`.next-codex-dev`設定は保持した。
- これはローカル検証結果であり、本番DB・本番メール・Stripe Live・GitHub上の現在の候補SHA・本番デプロイ状態は確認していない。リリース前の残りゲートは、全テスト/lint/型/Prisma/ビルドの再確認、最新ブランチとの差分とCI、本番環境preflight・バックアップ確認、明示承認後のデプロイ。

## 最新確認（2026-10-11）

**判定: ローカル検証は通過。本番リリースは未承認・未確認のため保留。**

### 2026-10-11 継続確認

- 直近の再実行では`npm test`、`npm run lint`、`npx tsc --noEmit`が成功。隔離した環境変数と出力先で`npm run build`も成功し、Next.js 16.4.0で103ルートを生成した。Stripe/Resend/Geminiのキーは空、DB URLはローカルの`_test`名に固定してビルドし、実サービスには接続していない。
- 認証トークンページ/APIに`private, no-store`と`no-referrer`を設定し、関連を含む`test:engagement`は121件成功。デプロイ後チェックを静的トップページのHEADからDBを読む`/api/system/status`へ変更し、Workflow YAMLの構文解析も成功。
- 今回の`npm run test:db-isolation`は終了コード1。`127.0.0.1:3306`へのTCP接続も失敗したため、今回のDB統合/API/E2Eテストは未確認。`.env`内の値は表示せず判定し、`DATABASE_URL`はローカル3306、`TEST_DATABASE_URL`は未設定で、安全ガードのローカル専用DBフォールバック条件は満たす。Windowsサービス状態の照会は権限不足で確認できなかった。
- 最新ソースの作業ツリーは209パスに変更・未追跡差分がある。現在の`codex/release-20260907`はローカル追跡ブランチより12コミット遅れ、ローカル`master`も追跡`origin/master`より9コミット遅れている。リモート更新、候補SHAのCI、統合、commit/pushは行っていない。従ってデプロイ可能なクリーン候補ではない。
- `npm audit --offline --omit=dev --audit-level=high`は0件だったが、オフラインキャッシュによる結果で最新の脆弱性情報を保証しない。

### 今日確認した事実

- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`、`npm run build`が成功。本番ビルドはNext.js 16.4.0で完了。ローカル`.env`は認証シークレット検証に通らなかったため、値を保存せず一時ランダム値をプロセス環境へ設定してビルドした。Playwright E2Eは専用のローカルテストDBでデスクトップ・モバイル合計24件成功、skipなし。
- APIルートテストは46ファイル・281件成功。最新の出力は文64.4%、分岐49.49%、関数62.72%、行68.57%。DB分離テストも成功し、Stripe識別子監査は重複0件。ただし監査対象のテストDBはユーザー0件であり、本番利用者の状態を示さない。
- `npm run test:usage`も2件成功。SavingsEventの実マイグレーションSQLバックフィル検証は専用テストDBの接続単位TEMPORARY TABLEのみを使って成功。
- デプロイ前に本番環境変数を値を表示せず検証し、メンテナンス状態、破壊的列削除の既存値、Stripe ID重複、SavingsEventテーブル/列の整合性、失敗migrationを調べる読み取り専用preflightを追加。専用テスト20件成功。実際の本番DBでの実行はしていない。
- Google OAuthは両方の資格情報があるときだけログイン・登録画面に表示し、片方だけの本番設定は事前チェックで拒否する。OAuth未設定時のPC・モバイル表示テストも成功。
- 本番環境チェックの認証・Stripe・SMTP別名判定をアプリ本体の`??`優先順位と一致させ、空文字の優先値が下位別名の値で誤って通過しない回帰テストを追加。全ユニットテスト、Lint、TypeScript、Prisma検証は再度成功。
- デプロイWorkflowにSavingsEventバックフィル検証、DBバックアップ確認ゲート、migration後の`npm prune --omit=dev`を追加。CI・デプロイ両Workflowはローカル`js-yaml`で構文解析成功。GitHub Actions上での今回の候補変更の実行は未確認。preflightが依存更新・ビルド・migrationより先に呼ばれる構成はソースで確認。
- Prisma 7.9.1が要求するNode.js範囲はロックファイル上で`^20.19 || ^22.12 || >=24.0`。従来のデプロイ検査と説明書の「20.9以上」は不正確だったため、ロックファイルから要件を読み取る検査をGitHub/manualデプロイへ追加し、26件のデプロイ・DB安全性テストで確認。Node 20.9、20.18、22.11、23系は事前に拒否する。
- 個人の削減実績ページ`/savings`に検索除外メタデータと`X-Robots-Tag`を追加。共通ヘッダーの回帰テストに含めて成功。
- `npm run test:db-isolation`が成功し、12種類の所有データと認証トークン3種類の分離、一回取得、ロールバック、DB件数維持を確認。
- ローカルTCPでは`127.0.0.1:3306`に接続でき、`3308`は接続できなかった。現在のアプリ・テスト接続設定は3306。3308の記載は過去の調査記録のみで、稼働設定には見つからない。
- 今回も本番DB、実メール、Stripe Liveには接続していない。`20260920080000_add_savings_event_dedupe_key`の本番適用状態は未確認で、これは本番適用直前にWorkflowの読み取り専用preflightが確認する。既存`SavingsEvent`行数の手作業共有は不要で、マイグレーションが既存行を保持してdedupe keyを自動バックフィルする。
- GitHub APIで確認した既定ブランチは`master`、現在のSHAは`7e3f1dc40e412a285973ab18c8b0bddc1eca264f`。このSHAには2026-09-21付けCIとSecurityの成功runがある。ローカル`codex/release-20260907`のHEAD`4605dd80592bf8ff65bb3f8a7ad693bcf54458e1`はmasterより13コミット遅れており、未コミット変更を含む候補SHAのCIは未実施。リモート`codex/release-20260907-verify`もmasterより15コミット遅れている。今回のローカル確認では作業ツリーに追跡変更102件・未追跡105件があり、統合は未実施。変更の一括commit/pushはしていない。
- オフラインnpm監査はローカルキャッシュで0件だが最新情報ではない。インストール済み`braces@3.0.3`は公式GitHub AdvisoryのHigh対象（<=3.0.3、修正版なし）で、開発依存`eslint-config-next`経由。本番Workflowはビルド・migration後にdev依存をpruneする。最新オンライン監査は未実施。[GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- `git diff --check`は変更済み`AGENTS.md`末尾の空行を報告した。今回の作業では同ファイルを編集していないため維持している。

### 次の必須ゲート

1. 承認されたデプロイ実行で読み取り専用preflightを通す。対象migration状態や既存行数の手作業共有は不要。preflightが不整合を検出した場合のみ、出力された集計情報に基づき対処方針を決める。
2. 最新のGitHubベースと未コミット差分を安全に照合し、差分を保持した候補SHAをCIに通す。
3. 本番バックアップ、環境変数、Stripe Live Webhook、メール、Apache/HTTPS、PM2を運用者が確認した後、明示的な承認を得てデプロイする。

## 最新確認（2026-10-10）

**判定: ローカルのコード検証は通過。本番公開の承認・環境確認は未完了。**

### 確認できた事実

- GitHubの現在の`master`は`7e3f1dc40e412a285973ab18c8b0bddc1eca264f`。同SHAの`CI`と`Security`は2026-09-21に成功し、本番デプロイworkflowも2026-09-22に成功している。ただし、その後の本番稼働状態をこの確認で検証したものではない。
- GitHubの作業ブランチ`codex/release-20260907`は`bb65197b387b59553c299a2eda66e027f19a6863`、ローカルHEADは`4605dd80592bf8ff65bb3f8a7ad693bcf54458e1`で一致しない。ローカルGit参照の`origin/master`も`e2618a0...`で、GitHubの現在の`master`より古い。作業ツリーには159件の変更があり、未レビュー・未送信の変更を含むため一括commit/pushやmergeはしていない。
- GitHubの`master`ブランチ保護は無効で、必須status checkは設定されていない。GitHub Actionsの最新master実行（2026-10-05）はDependabotのdynamic workflowであり、ローカル候補SHAに対するCI結果は存在しない。
- `npm test`、`npm run test:usage`、`npm run lint`、`npx tsc --noEmit` が成功。
- `npm run build` が隔離した出力先で成功し、Next.js 16.4.0で102ルートを生成。
- API/DB統合テストは45スイート・261件成功。標準ユニットテスト`npm test`も成功。最新APIカバレッジは文63.89%、分岐49.23%、関数61.56%、行68.33%。
- Stripe CheckoutはDBロック、既存Session再利用、処理中・支払い要確認契約の重複防止、応答不明時の同一冪等キー再試行を追加し、関連統合テスト13件が成功。
- Playwrightは21件成功、1件スキップ。PC/モバイル双方で管理者・メンテナンス・公開ページ・一般ユーザーフローを確認。モバイルの登録成功経路は、同一E2EサーバーのIP単位送信クールダウンにより重複実行を避けてスキップ。モバイル登録フォームの入力エラーは検証済み。
- DB所有者分離テストは12種類の所有データと3種類の認証トークンを確認し、成功。
- Stripe識別子監査はテストDB内の重複0件。ただし監査時のテストDBユーザー数は0件で、実ユーザーのStripe状態を示すものではない。
- 本番依存のオフライン監査はローカルキャッシュで0件。以前のオンライン監査時は本番依存0件、全依存ではHigh 5件（開発依存）を確認した記録がある。最新のオンライン監査はregistry DNS接続不可で未確認。
- 全依存の `npm audit --audit-level=high` はHigh 5件で失敗。`npm explain braces`で`eslint-config-next`→`@next/eslint-plugin-next`→`fast-glob`→`micromatch`→`braces@3.0.3`の開発依存経路を確認。本番依存監査は0件。GitHub AdvisoryはHigh（CVSS 8.7）、影響範囲`<=3.0.3`、修正版なし（2026-10-02更新）。現CIは開発依存監査を除外しているため、そのリスクをリリース審査で明示し、修正版公開後は更新する。`npm audit fix --force`は`eslint-config-next@14.2.35`への破壊的ダウングレードを提案するため実行していない。[GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- セキュリティ標準監査は認証API本文サイズと共有デモアカウントの権限問題を確認。両方とも現作業ツリーで修正・回帰テスト済み。ローカル `.env` の認証情報は有効性未確認のまま残っており、漏えい扱いでのローテーションが必要。
- 2026-10-11に`.env`の値を出さず状態を再確認。ローカルのStripeキーはLive形式でPrice IDとWebhook Secretは存在するが、Stripe APIには接続していないためPriceとのモード整合は不明。Resend APIキーは未設定でSMTPは設定済み、`NOTIFICATION_JOB_SECRET`は未設定、`NEWS_JOB_SECRET`とGoogle OAuth資格情報は存在する。テストランナーはStripeキーをテスト形式で上書きしResendを無効化する。ローカル`.env`をテストや本番へ流用しない。
- 追加Deep Scanは完了レポートを生成したが、レポート自身がワークスペースへアクセスできずソース監査未実施と記録。脆弱性なしの根拠には使用しない。
- DB分離テスト成功。ローカル `subsclist_test` には49マイグレーションを適用済み（今回のStripe Checkoutロック追加を含む）。本番DBの状態は未確認。
- `.env`のアプリDBは`localhost:3306/subsclist`。テストDBは`localhost:3306/subsclist_test`を想定。現在の`.env.example`とCIも3306だが、Git基準版`.env.example`に3308の指定が残っていたため、3306への修正を含む作業ツリー変更をリリース対象として維持する必要がある。
- 3308番ポートの再調査で、現在の`.env`と作業ツリー`.env.example`は3306。ただしGit基準版`HEAD:.env.example`は3308を指定していた。通常サンドボックスからの確認は失敗したが、昇格した読み取り専用確認では3306到達・待受を確認し、3308は到達不可だった。待受アドレスは`::`、PIDは5492。
- テストランナーで`RESEND_API_KEY`を空に固定し、ブラウザテストからResendを使った実メールが送られないようにした。
- Stripe Liveキーの利用を`NODE_ENV=production`かつ`STRIPE_LIVE_MODE_ALLOWED=true`に限定するガードを追加。テスト用キーは従来どおり使用可能。関連単体テスト8件、Lint、TypeScript型検査は通過。Liveキーを使う本番サーバーには新しいフラグ設定が必要で、ローカル`.env`には設定しない。
- 認証トークンのHMAC生成・照合前に`AUTH_SECRET`が32文字以上であることを必須化。旧SHA-256・旧scryptトークンの互換性も回帰確認。認証/課金APIへ8KB、その他JSON APIへ1MBの本文上限を適用し、超過テストを追加。最終状態でテストDB上の45スイート・261件、Lint、型検査、専用出力先の本番ビルド（102ルート）が成功。
- 今回のStripeガード追加後に`npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`は成功。昇格したローカルビルドは専用出力先とテストDB URLで成功し、102ルート生成。通常サンドボックスでは生成フォルダ作成時に`EPERM`となった。
- Stripe Webhookのイベント一覧に、コードが処理する`invoice.paid`と`invoice.payment_failed`を追加。

### 未確認・リリース前に必要

- 実メール、Stripe Live、ユーザー用本番DBへの接続・変更、デプロイは今回実施していない。過去にテスト済みとのユーザー申告はあるが、今回独立して再確認していない。
- Apache/HTTPS、PM2、cron、バックアップ復元、本番環境変数、Stripe Live Webhookの疎通はこの端末から検証していない。
- 作業ブランチ`codex/release-20260907`は現在184件の変更・未追跡パスを含む。GitHub APIで確認したmasterは`7e3f1dc`（PR #15のmerge commit）。基点`4605dd8`との比較ではmasterが13コミット先行し、5ファイルに差分がある。最新masterのCI/Security成功チェックは確認済みだが、現在の未コミット変更を含まない。ローカルorigin参照は古い。fetch、統合、コミット、pushは行っていない。
- PR #15統合時の変更にはCI/deploy workflow、依存ロック、認証トークンscrypt化が含まれる。現在の作業ツリーは同じ領域を変更し、HMAC化と旧scrypt互換も追加しているため、統合後にCI・監査・ビルドを再実行する必要がある。master `7e3f1dc`のCIとSecurity成功runは確認済みだが、現在の作業ツリー候補のチェックではない。
- GitHub PR #15のCodeQL、Secret scan、Dependency review、Semgrep、GitHub Actions lint、Test/audit/buildは成功。ただしテスト対象headは`bb65197`で、現在のローカル変更を含まない。リリースには差分を保護したうえで最新ベースへ統合し、現在の候補SHAでCIの合格を確認し、レビュー済み変更を承認された手順で本番へ反映する作業が残る。

**注意:** 本番DB・実メール・Stripe Liveには接続していない。ポート疎通はローカルTCPのみ確認。3308設定はGit基準版の`.env.example`に残っていたが、作業ツリーでは3306に修正済み。npm registryへの接続が拒否されたため、依存監査は今回更新できていない。

## 今回確認（2026-10-10時点）

**判定: リリース最終確認待ち。** 2026-09-01の下記記録は過去の検証結果であり、現在のリリース可判定として扱わない。

- 現在の作業ツリーで`npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`が成功。
- Next.js 16.4.0 / MariaDB 3.5.4 / Nodemailer 10.0.16へ更新。本番ビルドはWebpackで成功し、102ページを生成。
- 本番依存のnpm監査は以前0件だったが、今回の再監査はnpm registryのDNS接続不可で未確認。全依存監査の前回結果はHigh 5件で、開発依存`braces@3.0.3`を含む経路。最新情報での再確認が必要。
- ユーザー申告ではStripe決済とResendメールの実環境テストは完了。今回その外部サービスへ再接続・送信はしていない。
- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`が成功。Node.jsの組み込みテストからESMモジュール形式の警告が出るが、失敗はない。
- API統合テストは45スイート・261テスト成功、DB分離テスト成功。ブラウザE2Eはデスクトップ・モバイル合計21件成功、1件skip。メール認証の旧SHA-256トークンとパスワード再設定の旧scryptトークン、およびJSON本文サイズ上限の互換テストを追加。
- テスト用DB URL・Stripe test placeholder・専用出力先でproduction buildが成功し、102ページを生成。実DB・実メール・Stripe Liveには接続していない。
- ローカルMySQLは3306番ポートで待受し、127.0.0.1:3306へのTCP接続に成功、3308番は接続不可だった。3308番はGit基準版`.env.example`の古い値で、現在の`.env`と作業ツリー`.env.example`はいずれも3306番。本番DBへのテスト接続は行っていない。
- テストDBガードを追加し、統合テストとStripe監査をローカルの`_test` / `_ci` DBだけに限定。VitestとE2Eの直接起動にもDB名・プロトコル・ホスト検査を追加。CIでもガードの単体テストを実行する。
- 本番公開はまだ実施していない。ブランチ保護付きのGitHub CI、実サーバーの環境設定・DBバックアップ・マイグレーション・デプロイ後のHTTP確認が別途必要。

### 次のリリースゲート

1. 現在の変更159件とブランチ差分を保全したままレビューし、最新masterへの統合方針を決める。
2. npm registryへ依存名・バージョン情報を送信する監査の許可を得て、`npm audit --omit=dev --audit-level=high`と全依存監査を再確認する。以前の本番依存監査結果は今回更新できていない。
3. 統合後の候補SHAでGitHub CIが成功したことを確認し、承認されたデプロイ手順で本番反映する。
4. 本番でトップ、ログイン、認証、契約、Stripe Webhook、問い合わせ、メール、管理者/メンテナンス、ログアウトを確認する。決済・メールについては今回再試験していないため、過去のユーザー確認を含め最終判断する。

## 2026-09-01時点の過去記録

過去記録の日付: 2026-09-01

## 結論

SubscListのアプリケーションコードは、月額480円のリリース候補として公開可能な品質に到達しています。ここで新機能追加を止め、実利用者の反応と利用指標を確認してから次の開発優先度を決めます。

本番公開の最終条件は、環境ごとのシークレット設定、Stripe Webhook、Google SMTP、通知cron、HTTPSリバースプロキシの確認です。これらはソースコードへ値を保存せず、本番環境で設定します。

## 商品として提供できる範囲

- Free: サブスク10件まで、基本台帳、基本通知、基本集計
- Premium: 月額480円、初回のみ7日間無料、登録無制限
- 契約・更新・無料期間・解約期限のカレンダーと通知
- 支払い履歴、請求予定との突合、金額差異・未確認・予定外支払いの検出
- 明細CSV取込、登録前レビュー、名義ルール、取込単位の安全な取り消し
- 利用頻度、健康スコア、重複、削減候補、更新判断、解約チェックリストと証跡
- 月次締め、前月成果、年間比較、仕事利用分、科目・証憑整理、CSV/PDF共有
- Googleログイン、メール認証、Stripe Checkout/Portal/Webhook、PWA
- 管理者、お知らせ、メンテナンス、法務ページ、FAQ、お問い合わせ、SEO

## 検証結果

- 全272テスト成功、72テストファイル
- Lint、TypeScript型検査、本番ビルド成功
- Next.js 16.3.0、87静的ページ生成、全91ルート
- Prisma migration 38件、DB schemaは最新
- 12種類の所有データを利用者間で参照不可
- 認証トークン3種類の一回取得とロールバックを確認
- Stripe Customer ID / Subscription IDの重複0件
- `npm audit --audit-level=high`: 既知脆弱性0件
- 未認証ダッシュボードはログインへ307、個人画面はnoindex/no-store
- 署名なしStripe Webhookは400、未認証APIは401
- 公開トップ、料金、規約、プライバシー、特商法、FAQ、問い合わせ、robots、sitemapは200
- PCと390px幅で請求要対応、支払い導線、契約・解約導線を確認
- 横スクロール、ブラウザーコンソールエラー、最終サーバーエラーはいずれも0件

## 本番公開前の運用ゲート

1. 本番専用の`AUTH_SECRET`、`NOTIFICATION_JOB_SECRET`、DB、SMTP、Stripeシークレットを設定する。
2. Stripeの月額480円Price、7日無料体験、Webhook署名、Customer Portalをテストモードで再確認してから本番キーへ切り替える。
3. Google SMTPの接続と、登録、再送、パスワード再設定、メール変更の実メール到達を確認する。
4. `npm run prisma:deploy`前にDBバックアップを取得する。
5. Apache/Nginxからポート3000へ接続し、HTTPS、Cookie、canonical、OGPを本番ドメインで確認する。
6. 通知cronを設定し、管理画面で最終成功時刻と失敗件数を確認する。

## 公開後に測る指標

- 登録24時間以内に5件以上登録した割合
- 7日無料体験からPremiumへ移行した割合
- 月次レポート閲覧率と月次締め完了率
- 通知から支払い確認・更新判断・解約支援へ進んだ割合
- 30日継続率、解約理由、問い合わせ内容

これらの実測値がない段階では、追加機能の価値を断定しません。公開後は不具合、決済、通知、認証を優先し、要望件数と継続率に根拠がある機能だけを追加します。

## 追加検証（2026-10-11）

**判定: ローカル品質ゲートは通過。GitHub統合・依存監査・本番運用確認が未完了のため、リリース承認には至っていない。**

- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`が成功。
- `npm run build`が成功し、103ルートを生成。通常サンドボックスでは`.next`生成時に`EPERM`が出たが、権限制限外の再実行では通過。
- `npm run test:routes:coverage`: 46ファイル、276テスト成功。statement 64.65%、branch 49.72%、function 63.29%、line 68.86%。管理者のメンテナンス切替テストはCookie依存を撤去した実装に合わせて更新。
- `npm run test:db-isolation`成功。テスト用DB上で12種類の所有データの分離、トークン一回利用、失敗時ロールバックを確認し、DB件数が維持された。
- `npm run test:e2e`成功。PC/モバイル合計24件。管理者分離、メンテナンス、デモ読取専用、登録、主要な契約操作を確認。テスト実行後、Next.jsが変更した`tsconfig.json`は実行前の状態へ復元。
- `npm run test:migration-backfill`はCIと本番デプロイ検証Workflowの両方に組み込み済み。ローカルではテスト専用MySQLの同一接続内に作ったTEMPORARY TABLEだけに対して実マイグレーションSQLを実行し、既存行2件の保持、決定的キー、NOT NULL、一意インデックス、重複拒否を確認。永続テーブルには変更を加えない。GitHub Actionsでの実行は未確認。
- セキュリティ差分レビューは部分レビュー。確認した範囲で確定した報告対象の脆弱性はなし。ただし全153レビュー項目を個別精査したものではない。認証トークンのレート制限が`X-Forwarded-For`等を参照するため、本番Apacheのヘッダー正規化とNode.jsポートの外部到達性は運用側で確認が必要。
- 本番DBには接続していない。マイグレーション前のDB状態確認は、デプロイ時のread-only preflightが実行する。ユーザーがDB情報や認証情報をチャットへ貼る必要はない。
- `SavingsEvent.dedupeKey`追加マイグレーションは既存行ごとに`legacy:`+IDのSHA-256値をバックフィルしてからNOT NULL・一意制約を追加する。既存行は削除せず、事前に本番件数を手動共有する必要もない。preflightは履歴・テーブル・既存列の不整合を読み取り専用で検出する。
- GitHub `master`（`7e3f1dc40e412a285973ab18c8b0bddc1eca264f`）はローカル基点（`4605dd80592bf8ff65bb3f8a7ad693bcf54458e1`）より13コミット先行。GitHub Actions APIで同master SHAのCIとSecurity成功runを確認したが、現在の作業ツリー候補に対するCIではない。
- 2026-10-11にGitHub APIを再確認。`master` SHAは上記から変化なし。branch protectionは`false`で、repository rulesetsも空配列。これは本番障害ではないが、PR必須・CI必須の保護がない状態なので、候補統合前にGitHub側で保護ルールを設定することを推奨する。
- 作業ツリーは189件の変更/未追跡パスを含む。最新`master`との統合、変更意図の最終確認、候補SHAでのGitHub CIは未実施。既存変更保護のため、merge/rebase/commit/pushは行っていない。
- `npm audit --offline --omit=dev --audit-level=high`はローカルキャッシュに対して実行し0件。オンライン`npm audit`は依存情報をnpm registryへ送信するため未実施。最新の全依存監査は別途必要。
- 実メール、Stripe決済、Stripe Live Webhook、本番DB変更、本番デプロイは未実施。本番確認が必要なものは、秘密情報を共有せずサーバー上で実施する運用ゲートとして残す。

## 継続確認（2026-10-11）

- 現在の作業ツリーで`npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`が成功。`git diff --check`も成功。
- `scripts/production-restart.sh`の既定ヘルスチェックを`/api/system/status`へのGETに揃えた。これにより手動再起動とGitHub Actionsが同じDB依存ステータス経路を確認する。シェル構文検査はWindows環境に`bash`がなく実行できていない。CI上の`bash -n`が別途必要。
- このWindows環境から`127.0.0.1:3306`へのTCP接続は拒否された。テスト専用DBを使うDB統合テストとPlaywright E2Eは、現時点では実行成功を確認できない。ユーザーの本番DB情報は不要であり、ローカルのテストDB起動後に再試験する。
- 作業ツリーは210件の変更・未追跡パスを含む。これはリリース候補として統合・コミット済みではない。既存変更を保護するため、変更の一括整理、ブランチ統合、コミット、pushは行っていない。
- 前段に記録した本番ビルド成功は、今回のシェル運用スクリプトの小変更を含まない。アプリソースの再変更はないが、最終候補SHAでのCI・ビルド・E2Eは未確認。
- 実メール、Stripe、外部API、本番DB、本番デプロイは引き続き未実施。

## 継続確認（2026-10-12）

- 変更後の`npm test`成功（全スクリプト終了コード0）、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`、`git diff --check`も成功。
- 既定の`.next`と専用出力先の初回ビルドはWindowsの`EPERM`で停止した。承認済みの隔離出力先で再実行し、ビルドプロセスだけに一時生成したランダム`AUTH_SECRET`を渡したところ、Next.js 16.4.0本番ビルドと103ページ生成が成功。`.env`は閲覧・変更していない。通常の環境値では`AUTH_SECRET`が未設定またはポリシー不適合として静的生成が失敗するため、実行環境の設定確認はリリース前に必要。
- ビルドが自動追記した一時出力先の`tsconfig.json` include行だけを除去。既存の`.next-codex-dev`設定は保持。
- 契約外サービスの検索・ウォッチを提供していた旧SaaS Watchの利用者向けナビを外し、旧一覧・詳細URLは契約ニュースへ転送。Todayの価格変更リンクもニュースへ統一し、契約中サービスのニュースのみを表示する既存アクセス制御は変更していない。関連テストを更新し、全テスト成功を確認。
- セキュリティ差分レビューは175レビュー項目を確認し、報告対象0件で完了。ただしレビュー中に作業ツリーが更新されたため、レポートの静的スナップショットは元候補時点。後続UI差分は別途手動確認済み。外部サービス、メール、Stripe、本番環境には接続していない。
- 再確認時点で`127.0.0.1:3306`と`127.0.0.1:3000`は接続拒否。DB統合テスト・ブラウザーテストは実施できず、画面の実操作確認は未完了。
- 作業ツリーの既存変更は保持。GitHub統合、候補SHAでのCI、コミット、push、デプロイは行っていない。

## 継続確認（2026-10-12・追加）

**判定: ローカル品質ゲートは通過。本番公開は未承認・未実施。** 以下はこの追記時点の確認で、上記の過去スナップショットを置き換える。

- `npm test`、`npm run test:usage`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`が成功。npm組み込みテストのESM形式警告はあるが失敗なし。
- `npm run test:routes:coverage`: 46スイート・283テスト成功。Statements 64.55%、Branches 49.39%、Functions 62.81%、Lines 68.75%。
- `npm run test:db-isolation`、`npm run test:migration-backfill`成功。テスト専用DB上の所有者分離と接続限定TEMPORARY TABLEでの既存行保持を確認。本番DBは未接続。
- `npm run audit:stripe`成功。テストDBには利用者データが0件のため、この結果は本番Stripe契約状態の証明ではない。
- `npm run test:e2e`: デスクトップ/モバイル計26件成功。隔離出力先を使ったNext.js 16.4.0の本番ビルドは103ルート生成で成功。テスト後は専用生成物とNext.jsが追加したtsconfig行だけを除去し、`.next-codex-dev`を含む既存設定を保持。
- npm公式レジストリへの全依存監査`npm audit --audit-level=high`は0件。`eslint-config-next`を置き換え、`braces`と同パッケージを依存ツリーから除外。CIと本番デプロイworkflowも本番依存限定ではなく全依存を監査する設定へ変更。
- 作業ツリーには引き続き多数の変更・未追跡ファイルがある。今回の検証結果は現在のローカル内容に対するもので、GitHubへ送信済みの候補SHAに対するCIではない。コミット・push・デプロイは行っていない。
- ローカル`.env`では`RESEND_API_KEY`と`NOTIFICATION_JOB_SECRET`が未設定。メールは設定済みSMTPへフォールバックする構成だが、Resend送信はこの環境では確認できない。送信元名の重複割当もあり値が一致しない。これらはローカル環境の事実で、本番環境の状態を示さない。秘密値は表示・変更していない。
- 本番`.env`、本番DBのmigration状態、バックアップ復元性、Stripe Live/Webhook、実メール、Apache/HTTPS、PM2、公開URLの外部疎通は未確認。デプロイworkflowの読み取り専用preflightと本番運用確認が残る。
- GitHubの既定ブランチ保護状態と候補変更へのCIは、この追記では再確認していない。過去記録の日付・対象SHAの情報を現状として流用しない。

## 継続確認（2026-10-12・認証ロック修正後）

- `npm test`成功。アカウントロック中に正しいパスワードでログインできてしまう分岐を発見し、ロック期限確認をパスワード照合後の共通経路へ移動。回帰テストで429、セッション未発行、ロック期限不変を確認。ロック中の不正パスワードも送信元レート制限へ記録することを確認。
- `npm run test:routes:coverage`は46スイート・283件成功。`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`、`git diff --check`も再確認済み。
- 最新ソースで隔離出力先の本番ビルドとPlaywright E2E 26件（デスクトップ・モバイル各13件）が成功。Next.jsが自動追記した今回専用のtsconfig行と専用ビルド/E2E出力のみ除去し、既存の`.next-codex-dev`設定は保持。
- 依存関係Lint構成の置き換えはnpm公式レジストリの監査でHigh以上0件を確認済み。CI/デプロイworkflowは全依存を監査する設定。実行時点のnpm audit結果は前段の2026-10-12記録を参照。
- CI定義の静的再点検で、Route/E2E DBテストに必要な`TEST_DATABASE_URL`欠落とCI側Playwright Chrome未導入を発見。CIとデプロイ検証workflowへテスト専用DB URLを設定し、CIにChromeセットアップを追加。3 workflowのYAMLパースとDB URL一致・Chrome stepの存在を検証。GitHub Actions上の実行結果は未確認。
- 作業ツリーの大量の既存変更は維持。コミット、push、マージ、本番DB操作、実メール、Stripe Live操作、本番デプロイは行っていない。GitHub候補SHA上でのCIと本番環境設定・運用確認は引き続き未完了。

## 継続確認（2026-10-12・ビルド/DB/E2E再検証）

- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npx prisma validate`、`npm ls --depth=0`が成功。Next.js本番ビルドは通常権限では`.next`作成時のWindows `EPERM`で停止したが、承認済みの権限で再実行してNext.js 16.4.0・103ルートのビルドが成功。
- 通常権限のMySQL状態照会は拒否されたが、昇格した読み取り専用確認で`MySQL84`が稼働し`127.0.0.1:3306`へ接続できることを確認。安全なDBテストランナー経由の`npm run test:db-isolation`が成功し、12種類の所有データ分離、認証トークンの一回取得と失敗時ロールバック、DB件数維持を確認。
- `npm run test:e2e`成功。Next.js本番ビルドを使用し、Playwrightのデスクトップ/モバイル計26件が成功。実メールとStripe Liveは使用していない。Next.jsが`tsconfig.json`へ追加した`.next-e2e`型パスだけを取り除き、既存の`.next-codex-dev`設定を保持。
- 今回の`npm audit --audit-level=high`はnpmレジストリのDNS解決失敗で実行できなかった。以前のレジストリ監査でHigh以上0件を確認した記録はあるが、今回の最新監査結果とは扱わない。
- これらはローカル検証であり、GitHub候補SHAのCI、本番DBのmigration状態・バックアップ復元性、Stripe Live/Webhook、実メール、Apache/HTTPS、PM2、公開URL疎通は未確認。コミット、push、本番操作、デプロイは行っていない。

## GitHub候補照合（2026-10-12）

- ローカルHEAD `7e3f1dc40e412a285973ab18c8b0bddc1eca264f` はGitHub `master` と一致。GitHub上の`codex/release-20260907`はローカルHEADの親コミット`bb65197b387b59553c299a2eda66e027f19a6863`を指し、追加のリモートコミットはなかったため、取り込みは不要。
- GitHubの当該HEADに対するcombined statusとPR起点workflow検索は空。これはGitHub Actions全実行履歴の不存在を意味するものではない。何より、ローカル作業ツリーの未コミット変更は同SHAに含まれず、その変更のGitHub CI結果はない。
- 作業ツリーの変更は引き続き保持し、コミット・pushしていない。本番リリース前に候補差分の選別と、その候補SHAでのCI実行が必要。

## 継続確認（2026-10-12・移行テストとローカル環境設定）

- `test:migration-backfill`を拡張し、接続終了時に破棄される一時テーブルで4つの既存行バックフィル（SavingChallenge、PaymentHistory、StripeWebhookEvent、SavingsEvent）を検証。JSTでDATEをUTC ISO文字列化すると前日になるテスト側の比較誤りを修正し、再実行成功。`npm test`、Lint、TypeScriptも再成功。
- ローカル`.env`は値を表示せず状態だけ確認した。Stripeキー種別はLiveで、`STRIPE_LIVE_MODE_ALLOWED=true`。Resend APIキーは未設定だがSMTPと送信元設定は存在するため、現状のメール経路はSMTPフォールバック。実メール送信は行っていない。`APP_URL`はHTTPSではなく、ローカル設定のまま既定`.next`をビルドすると静的HTMLにlocalhost URLが含まれる。
- 実シークレットを継承しないプロセス限定のダミーStripe/メール設定と本番URLを使った隔離ビルドは成功し、103ルートを生成。トップページの静的HTMLは本番URLを含みlocalhostを含まないことを確認。`.env`内の実キー値がビルド成果物に含まれないことも一致比較で確認。既定`.next`はローカル環境向け成果物であり、本番候補とは扱わない。
- 現コードは明示フラグにより開発環境でもStripe Liveを許可する。ローカル`.env`でその条件が成立しているが、今回Live API・決済を呼び出していない。開発環境でのLive利用を常に拒否するかは利用者判断待ち。ローカル`.env`のLive設定を本番サーバー以外で使うことは避ける。
- オンライン`npm audit --audit-level=high`はnpmレジストリDNS失敗。`npm audit --offline --audit-level=high`はキャッシュ上0件だったが、最新アドバイザリ情報を保証しない。GitHub未コミット候補のCI、本番DBの状態・バックアップ復元、本番サービス疎通、デプロイは未確認・未実施。
- `scripts/production-restart.sh`の依存導入も`npm ci --ignore-scripts`へ統一し、その後のPrisma生成を明示実行する形を維持。Windows環境にbash/WSLディストリビューションがなく、手動スクリプトの`bash -n`は未実施。CI workflowには同スクリプトの構文検査stepがあるが、未コミットのためGitHub上では未実行。
- 変更済み`src.zip`はエントリ名・内容を読み取り検査し、`.env`エントリおよびローカル`.env`秘密値との一致なし。ビルド成果物3箇所もローカル秘密値との完全一致なし。秘密値自体は表示・保存していない。
- E2E完了後の専用`subsclist_test` DBを読み取り確認し、`@invalid.example`のfixtureユーザーは0件、`maintenanceMode`は`disabled`。本番DBには接続していない。

## 継続確認（2026-10-12・Lint承認と再検証）

- ユーザー承認に基づき`eslint-config-next`を使わないflat configへ移行。`npm run lint`成功。`npm audit --offline --audit-level=high`はキャッシュ上0件だが、同日のオンライン監査は`registry.npmjs.org`のDNS解決失敗で最新アドバイザリを取得できなかった。
- `npm test`、`npx tsc --noEmit`、`npx prisma validate`成功。`git diff --check`成功（CRLF変換警告のみ）。
- APIルート回帰テストは通常サンドボックスではVitest一時キャッシュのrenameが`EPERM`で失敗。権限制限を外した再実行で46ファイル・283テストが成功。Statements 64.55%、Branches 49.39%、Functions 62.81%、Lines 68.75%。
- `npm run test:db-isolation`成功。12種類の所有データ分離、トークン一回利用、途中失敗時のロールバックを確認し、テストDB件数を維持。
- `npm run test:e2e`成功。隔離した本番ビルドは103ルート、Playwrightはデスクトップ/モバイル各13件、計26件成功。ビルドとE2E出力先は既存成果物を削除せず保持。Next.jsが`tsconfig.json`へ自動追記した今回専用の型パスだけを除去。
- E2E後にローカル専用`subsclist_test`をSELECTのみで確認し、`@invalid.example`ユーザー0件、`maintenanceMode=disabled`。本番DBへの接続・変更、実メール、Stripe Live呼び出し、デプロイは行っていない。
- 作業ツリーの変更・未追跡パスは217件。候補変更は未コミットでGitHub CIの対象外。オンライン依存監査、GitHub候補SHAでのCI、本番の運用設定と疎通、Live Stripe/Webhook・実メールの確認は未完了。
- ユーザー判断により、Stripe Liveキーは`NODE_ENV=production`かつ`STRIPE_LIVE_MODE_ALLOWED=true`のときだけ許可するよう変更。開発環境はフラグ設定に関係なくLiveキーを拒否し、sk_testのみ利用可能。`.env`は変更せず、Live Stripe API・決済は呼び出していない。Stripeキー判定の回帰テスト、Lint、TypeScript、全ユニットテスト、隔離本番ビルドが成功。
- メール送信テストは実施していない。E2E/DB統合テストではResendキーを空にし、SMTPを`127.0.0.1:1`に固定して外部への送信を防止。登録フローのブラウザ確認は行ったが、実メール到達の確認ではない。
- 本ターンで作成した隔離ビルド/E2E出力は既存生成物を消さない方針により作業ツリーに保持している。今回の最終検証はテストコード・ビルド成果物を含む未コミット作業ツリーに対する結果。

## 継続確認（2026-10-12・メール非送信と依存監査）

- メール送信テストは行っていない。`scripts/run-db-tests.cjs`はResendキーを空にし、SMTPを`127.0.0.1:1`へ固定する。認証・問い合わせのRouteテストはメール送信関数をモックしている。実メール、Resend API、外部SMTPへの接続は発生していない。
- `npm audit --audit-level=high`はnpmレジストリ`registry.npmjs.org`のDNS解決失敗で今回も実行不能。`npm audit --offline --audit-level=high`はローカルキャッシュ上0件だが、最新アドバイザリを反映した結果とは保証できない。`npm explain braces`では依存ツリーに`braces`は存在しなかった。
- 認証・セッション、Stripe Checkout/Webhook、CSRF/メンテナンス制御、メール送信経路の差分を読み取り確認。現時点でこの範囲から修正を要する具体的脆弱性は確定していない。全183件の差分インベントリに対するセキュリティレビューと正式な候補検証は未完了であり、包括的な「問題なし」判定ではない。
- 作業ツリーは変更・未追跡ファイルを含む状態を維持。`git diff --check`は通過。ローカル候補SHAのGitHub CI、最新オンライン依存監査、本番運用環境・DB・バックアップ・外部サービスの確認は未完了。実メール、Stripe Live、本番DB変更、コミット、push、デプロイは行っていない。
- 管理者一斉メールAPIに32KBのJSON本文上限を追加。上限超過は413で拒否し、メール送信関数が呼ばれないRoute回帰テストを追加。テストは送信関数をモックし、実メールを送っていない。変更後はRoute 46ファイル・284テスト、`npm test`、Lint、TypeScript、Prisma validate、専用出力先の本番ビルド（103ルート）が成功。通常権限のRoute test/buildはVitest/Next.js一時ファイル操作の`EPERM`で止まり、承認済み権限で再実行して成功した。
- CIとデプロイ前検証Workflowから固定の認証シークレット、SMTPパスワード、ジョブトークンを除き、GitHub runner上で実行ごとにランダム生成するよう変更。両YAMLをパーサーで検証済み。GitHub Actions上の実行は未確認。

## 継続確認（2026-10-12・リリーステスト更新）

- メールは実送信していない。ブラウザE2EではResendキーを空にし、SMTPを接続不能なローカルアドレス`127.0.0.1:1`へ固定した。メールRouteテストも送信クライアントをモックしている。Resend API・外部SMTPへの接続はなく、送信上限は消費していない。
- メール送信処理のユニットテストでResendリクエスト、冪等キー再利用、固定宛先、HTMLエスケープ、再試行条件をモック検証。Resendの4xxは再試行せず、429/5xxと通信例外のみ同一キーで再試行する。SMTPは接続確認だけ再試行し、送信自体の失敗は重複送信を避けるため自動再試行しない。これは配信到達テストではない。
- 今回の変更後に`npm test`、`npm run test:routes`（47スイート・289件）、`npm run test:e2e`（PC・モバイル計26件）、Lint、`npx tsc --noEmit`が成功。`test:engagement`（121件）、`test:saas-watch`（23件）、Prisma validate、DB分離、マイグレーションバックフィル、Stripe識別子監査も確認済み。
- デプロイpreflightが説明用の`RESEND_API_KEY`やSMTP認証値を受理し得たため、Resendキー形式とメール設定のプレースホルダー拒否を追加。`npm run test:db-guard`は28件成功。実資格情報やメールAPIへの接続なし。
- 今回の変更を含む隔離出力先への本番ビルドは103ルートを生成して成功。公式npmレジストリに接続した`npm audit --audit-level=high`は脆弱性0件（前回確認）。通常のサンドボックスではNext.js/Vitestの一時ファイル作成が`EPERM`となり、承認された権限で該当検証を再実行して成功した。
- 実メール到達、Stripe決済/Webhook、Production DB、バックアップ復元、GitHub候補SHAのCI、本番デプロイ後スモークは未実施。ユーザーから完了申告がある外部テストも、このローカル記録では独立検証していない。リリース判定は保留。
