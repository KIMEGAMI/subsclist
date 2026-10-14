# SubscList 詳細テスト仕様書

更新日: 2026-10-13<br>
対象: `D:\MyDeveloper\SubscList` の現行ソース<br>
目的: リリース前の機能・セキュリティ・データ整合性・画面品質を、再現可能な手順で確認する。CI/CD、コミット、push、公開環境への反映は本仕様の実行対象外。

この文書は `docs/SUBSCLIST_480_RELEASE_TEST_SPEC.md` の大項目を具体化し、現行コードに合わせて作成した詳細版である。テスト項目は381件。既存テストの合格を本書の全項目の合格とみなさない。実行記録がない項目は未実施のままとする。

## 1. テスト対象と基準

実装棚卸し時点で画面42ページ、API Route 79本、APIテスト48ファイル、Playwright E2E 28ケースを確認した。主な領域は、メール認証・Google OAuth、セッション/不審ログイン対策、Free/Premium、Stripe、契約・支払い・カレンダー、CSV明細、利用状況・見直し・削減、SaaSニュース、通知、管理者・メンテナンス、個人情報、エクスポートである。

期待値は現行仕様を参照し、契約上限はFree 10件・カテゴリ5件、Premium料金はStripe設定と表示の双方が月額480円JPYであることを基準とする。無料トライアルは実装設定が有効な場合だけ検証し、期間は設定値とStripeの状態を照合する。AI分析は設定済みGeminiサーバーAPIを使う機能として扱い、ブラウザーへAPIキーを露出させない。ニュース取得はユーザーの操作による更新と契約関連性を検証し、未契約サービスの記事を混入させない。

### 1.1 共通テストデータ

| 識別子 | 用途・初期状態 |
|---|---|
| U-FREE | メール認証済みFree一般ユーザー。契約0件、カテゴリ0件 |
| U-PREMIUM | メール認証済みPremium一般ユーザー。Stripe状態はテスト用フィクスチャで制御 |
| U-UNVERIFIED | メール未認証ユーザー。保護APIへアクセス不可 |
| U-ADMIN | 管理者。一般ユーザー/デモとは別の識別子と資格情報を使う |
| U-DEMO | 読取専用のデモ一般ユーザー。管理者権限なし、書込み不可 |
| U-A / U-B | 独立ユーザー。契約・支払い・ニュース・証跡の所有者分離に使う |
| TOK-VALID / TOK-EXPIRED / TOK-USED | 正常・期限切れ・使用済みの認証/再設定トークン |
| SUB-BOUNDARY | 9/10/11件目、31日開始、うるう日、週/四半期/半年/年/任意周期の境界値用契約 |
| PAY-BOUNDARY | 同日複数件、重複、返金/取消状態、月末・年境界の支払い履歴 |

各テスト実行ごとに合成メール（`.invalid` ドメイン）と一意なデータを使う。既存DBを初期化する場合も `subsclist_test` のような明示的テストDBに限定し、接続先名を実行前に確認する。`subsclist` 等の本番名、外部ホスト、root資格情報をテストへ渡さない。シークレットは環境変数/シークレットストアから取得し、画面・ログ・証跡に値を残さない。

### 1.2 実施区分・優先度

- `API`: Route/API統合テスト。認証、権限、HTTP status、JSON、DB副作用を検証する。
- `E2E`: Playwrightで実ユーザーフロー、表示、遷移、PC/モバイルを検証する。
- `手動`: 外部サービス設定、配信到達、実ブラウザー、運用手順を専用の検証環境で確認する。
- `P0`: 認証・権限・課金・データ漏えい・破壊に関わる。未合格はリリース不可。
- `P1`: 主要ワークフロー/金額/通知/表示の誤り。原則リリース前に修正する。
- `P2`: 低リスクの互換性・使いやすさ。結果と残リスクを記録する。

## 2. 公開ページ・導線・検索・PWA（PUB: 18件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| PUB-001 | P0 | E2E | `/` を匿名で開く。200相当で表示され、例外画面・機密値・管理情報を出さない。 |
| PUB-002 | P0 | E2E | トップから「ログイン」を押す。`/login` に遷移し、登録画面へ誤誘導しない。 |
| PUB-003 | P0 | E2E | 登録済み利用者向けログイン導線と新規登録リンクが別々に見える。 |
| PUB-004 | P1 | E2E | デモリンクを押す。U-DEMOとして閲覧でき、管理者名・管理メニュー・管理API情報を表示しない。 |
| PUB-005 | P0 | API | デモログイン後にPOST/PUT/PATCH/DELETEを各代表APIへ送る。変更は拒否され、DB値が不変。 |
| PUB-006 | P0 | E2E | デモ利用者で管理ページへ直アクセスする。管理画面を表示せず、認可済み状態にもならない。 |
| PUB-007 | P0 | E2E | `/pricing` とトップの料金表示を照合する。月額・通貨・税込表示方針が一致し、買い切り/980円表記がない。 |
| PUB-008 | P1 | 手動 | 公開コピー内の利用規約、FAQ、特商法、プライバシー、問い合わせを順に開く。価格・機能・連絡先に矛盾がない。 |
| PUB-009 | P1 | API | `/robots.txt` を取得する。公開ページと非公開ページの検索制御が意図どおりである。 |
| PUB-010 | P1 | API | `/sitemap.xml` を取得し、公開URLだけを含み、管理・個人データURLを含まない。 |
| PUB-011 | P1 | E2E | 各公開ページのcanonicalを確認する。正式URLのscheme/host/pathが重複なく正規化される。 |
| PUB-012 | P1 | E2E | OGP title/description/imageを検査する。空値、ログイン後情報、内部URLを出さない。 |
| PUB-013 | P1 | API | manifestを取得する。JSONとして解析でき、アプリ名、start URL、display、theme値が妥当。 |
| PUB-014 | P1 | E2E | favicon/manifest iconをPC・モバイルで取得する。404、壊れた画像、背景との識別不能がない。 |
| PUB-015 | P1 | E2E | 320px/375px幅でトップ、料金、ログインを開く。横スクロール、文字重なり、切れたCTAがない。 |
| PUB-016 | P1 | E2E | 768px/1280px/1920pxで公開ページを開く。余白、本文幅、ナビゲーションが破綻しない。 |
| PUB-017 | P1 | 手動 | Firefox/Chrome/Edgeでトップからログイン・デモ・法務ページへ遷移する。主要結果が一致する。 |
| PUB-018 | P1 | E2E | JavaScript無効/読み込み失敗時に公開内容と主要導線が完全に誤表示されず、明確な失敗状態になる。 |

## 3. 登録・メール認証・パスワード回復（AUTH: 30件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| AUTH-001 | P0 | API | 新規の有効メールで登録。アカウントは未認証で作成され、認証案内を返す。 |
| AUTH-002 | P0 | API | 登録payloadにメール認証済み指定を偽装する。サーバーは無視し未認証を維持する。 |
| AUTH-003 | P0 | API | 登録時に別ユーザーID/plan/roleを送る。クライアント指定値を保存しない。 |
| AUTH-004 | P0 | API | 正常認証tokenを使用。メール認証とセッション発行が仕様どおり一連で完了する。 |
| AUTH-005 | P0 | API | 同じ認証tokenを2回使用。2回目は拒否され、別ユーザー・別tokenを変更しない。 |
| AUTH-006 | P0 | API | 期限切れtokenで認証。拒否され、emailVerifiedを更新しない。 |
| AUTH-007 | P0 | API | 存在しない/形式不正/改ざんtokenを送る。安全なエラーだけ返し、スタックやユーザー情報を出さない。 |
| AUTH-008 | P0 | API | 再送後に旧token、新tokenを順に使う。旧tokenは無効、新tokenだけが成功する。 |
| AUTH-009 | P0 | API | 認証メール送信を意図的に失敗させる。成功偽装せず再送可能な未認証状態を維持する。 |
| AUTH-010 | P0 | 手動 | 検証環境で一通だけ認証メールを送る。From、件名、日本語、本文、URL、到達先を確認する。 |
| AUTH-011 | P0 | E2E | 新規登録画面へ到達し、確認用パスワード不一致で送信。送信せず該当欄の日本語エラーを示す。 |
| AUTH-012 | P1 | API | パスワードの最小長未満・空・最大長超過を各送信。受理せず明確なvalidation error。 |
| AUTH-013 | P1 | API | メール空白、空文字、形式不正、過長を各送信。正規化/拒否が一貫しDB副作用なし。 |
| AUTH-014 | P1 | API | 大文字小文字だけ異なる既存メールで登録。重複アカウントが作られない。 |
| AUTH-015 | P1 | API | 未認証アカウントの同一メールで再登録。ログイン済みと誤認させず認証再送導線を返す。 |
| AUTH-016 | P0 | E2E | 登録ボタンを連打/Enter連打。二重ユーザー・二重token・不必要な複数送信を作らない。 |
| AUTH-017 | P1 | API | 認証tokenをURL queryへ置いたページを開く。Referrer-Policy no-referrer、no-storeが付与される。 |
| AUTH-018 | P1 | API | verify pageのレスポンスをキャッシュ経由で再取得。token含有内容が共有キャッシュに保存されない。 |
| AUTH-019 | P0 | API | CSRF/Origin不正の登録POSTを送る。mutationを実行しない。 |
| AUTH-020 | P1 | API | 大きすぎるJSON/非JSON/切断bodyで登録。上限を超えず安全な4xxを返す。 |
| AUTH-021 | P0 | API | 有効ユーザーでforgot-passwordを要求。存在有無を判別できる差異を返さない。 |
| AUTH-022 | P0 | API | 有効なreset tokenで新パスワードを設定。旧パスワードは失効し新パスワードだけ成功する。 |
| AUTH-023 | P0 | API | reset tokenを再利用/期限切れ/改ざんして送る。パスワードを変更しない。 |
| AUTH-024 | P0 | API | パスワード再設定メールを失敗させる。token状態と応答が一貫し、情報漏えいしない。 |
| AUTH-025 | P1 | 手動 | 検証環境でpassword resetメールを一通送信。宛先、期限、URL、文面、リンク先を確認する。 |
| AUTH-026 | P1 | API | 複数のreset tokenを連続発行。最新tokenの有効性と旧token失効ルールを確認する。 |
| AUTH-027 | P0 | API | login/registration/resend/forgot-passwordを短時間に上限超過。429等となり副作用なし。 |
| AUTH-028 | P1 | API | 不正tokenで繰り返し高コストpassword verification経路を叩く。rate limitが先に効く。 |
| AUTH-029 | P1 | E2E | 新規登録後の共通案内を表示。登録済み/未登録の差を画面文言で漏らさない。 |
| AUTH-030 | P1 | E2E | Verify/reset URLから戻る・再読み込みする。token再使用エラーを日本語で示しループしない。 |
| AUTH-031 | P0 | API | Google OAuth開始でstateを発行。stateは推測困難でSecure/HttpOnly/SameSite cookieに保存される。 |
| AUTH-032 | P0 | API | callbackで正しいstate/codeを送る。state検証後のみGoogle token交換へ進む。 |
| AUTH-033 | P0 | API | stateなし/改ざん/別browser cookieのcallback。token交換・ユーザー作成・session発行を行わない。 |
| AUTH-034 | P0 | API | OAuth provider error/拒否/timeoutをcallbackへ返す。安全なエラー表示でsessionを発行しない。 |
| AUTH-035 | P0 | API | Google email未verified、missing email、無効tokenを返すfixture。ローカルアカウントへ誤紐付けしない。 |
| AUTH-036 | P0 | API | Google emailが既存local accountと一致。明示した安全なlink方針に従い、無検証で乗っ取らせない。 |

## 4. ログイン・セッション・アカウント保護（SEC: 30件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| SEC-001 | P0 | API | 正しいemail/passwordかつ認証済みでlogin。セッションcookieを発行し本人画面へ遷移する。 |
| SEC-002 | P0 | API | 正しい資格情報だが未認証でlogin。保護画面cookieを発行せず認証案内を返す。 |
| SEC-003 | P0 | API | email不存在/誤passwordでlogin。一般化された失敗応答を返し、どちらが違うか漏らさない。 |
| SEC-004 | P0 | API | disabled/deleted userでlogin。セッションを発行しない。 |
| SEC-005 | P0 | API | 誤passwordを規定回数続ける。アカウント保護/遅延が発動し、イベント記録はPIIなし。 |
| SEC-006 | P1 | API | lock期間中に正しいpasswordでlogin。ロック方針どおり拒否し、ロック解除後は正常化する。 |
| SEC-007 | P0 | API | login前後のsession cookieを比較。固定/再利用によるsession fixationがない。 |
| SEC-008 | P0 | API | cookie属性を確認。HttpOnly、Secure（HTTPS）、SameSite、Path、期限が想定どおり。 |
| SEC-009 | P0 | API | cookieの署名・payloadを改ざんして保護APIへ送る。拒否しDB更新なし。 |
| SEC-010 | P0 | API | sessionVersionを変更後、旧cookieでアクセス。旧セッションが失効する。 |
| SEC-011 | P0 | API | `/api/auth/logout`をCSRF保護条件で呼ぶ。cookie失効しログアウトが完了する。 |
| SEC-012 | P0 | E2E | logout後に戻る/更新する。保護ページに個人情報を再描画せずloginへ誘導する。 |
| SEC-013 | P0 | API | A cookieでBのresource IDをGET。404/403等の安全な拒否でデータを返さない。 |
| SEC-014 | P0 | API | A cookieでBのresourceをPUT/PATCH/DELETE。更新/削除件数0、両者データ維持。 |
| SEC-015 | P0 | API | 未認証cookieなしで全保護APIを呼ぶ。認証要求となりDB読み書きしない。 |
| SEC-016 | P0 | API | 未認証ユーザーcookieでAPIを呼ぶ。email verification gateが働く。 |
| SEC-017 | P0 | E2E | `returnTo`に外部URL/`//host`/CRLFを渡す。open redirectせず許可pathだけへ戻る。 |
| SEC-018 | P0 | API | mutationに別Origin/不正Originを付ける。CSRF guardが拒否する。 |
| SEC-019 | P1 | API | mutationに正規Originと許可method/content-typeを付ける。通常動作を壊さない。 |
| SEC-020 | P1 | API | 同一ユーザーの新端末/新IP相当の判定をfixtureで再現。新端末イベントを適切に記録する。 |
| SEC-021 | P1 | API | eventを表示・管理画面で読む。email、password、token、IPそのものを不要に露出しない。 |
| SEC-022 | P0 | API | 全セッション失効endpointを本人が呼ぶ。sessionVersion更新後、旧端末cookieが失効する。 |
| SEC-023 | P0 | API | 別ユーザーの全セッション失効を試みる。拒否され、対象のversionを変更しない。 |
| SEC-024 | P1 | E2E | password change後、現在端末と他端末のログイン状態が仕様どおりで、無効端末は再認証要求。 |
| SEC-025 | P0 | API | response/headerに`Set-Cookie`以外の秘密、token hash、password hashが含まれない。 |
| SEC-026 | P0 | 手動 | APIエラーを誘発。公開レスポンスは日本語の安全な要約のみでstack/SQL/pathを含まない。 |
| SEC-027 | P1 | API | 連続404/ID列挙を実施。resource存在確認の応答差異がIDORを補助しない。 |
| SEC-028 | P1 | API | URL encoding、Unicode normalization、case variationで別人のemail/sessionを奪取できない。 |
| SEC-029 | P0 | API | 全保護Routeのmiddleware/proxy適用を一覧化し、除外漏れのRouteで匿名アクセスが成功しない。 |
| SEC-030 | P1 | 手動 | 利用者ログを検査する。パスワード、認証URL、token、メール本文、PII、Authorization headerがない。 |

## 5. 管理者・権限・メンテナンス・問い合わせ（ADMIN: 20件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| ADMIN-001 | P0 | API | U-ADMINでadmin routeを呼ぶ。管理権限に基づく応答を得る。 |
| ADMIN-002 | P0 | API | U-FREEでadmin GET/POST/actionを呼ぶ。403/安全な拒否でDB変更なし。 |
| ADMIN-003 | P0 | API | U-DEMOでadmin GET/POST/actionを呼ぶ。権限付与されず拒否。 |
| ADMIN-004 | P0 | API | body/query/headerのrole=ADMIN偽装で通常ユーザーが管理APIを呼ぶ。拒否される。 |
| ADMIN-005 | P0 | API | 管理メニューのURL直打ち。非管理者には内容が描画されず非特権画面へ誘導される。 |
| ADMIN-006 | P0 | API | maintenanceを一般ユーザーがon/offしようとする。状態不変。 |
| ADMIN-007 | P0 | E2E | U-ADMINがmaintenance on。匿名/一般ユーザーだけmaintenance画面へ誘導される。 |
| ADMIN-008 | P0 | E2E | maintenance中にU-ADMINが管理ページを開く。管理操作・解除が可能。 |
| ADMIN-009 | P0 | E2E | maintenance中に一般利用者がlogin、register、dashboard、APIを開く。公開許可範囲以外は遮断。 |
| ADMIN-010 | P0 | API | health/webhook/認証callbackなどmaintenance除外Routeを確認。機能継続が必要なrouteだけ許可。 |
| ADMIN-011 | P1 | API | maintenance設定を連続切替する。DB設定が最終操作と一致し、競合値が残らない。 |
| ADMIN-012 | P1 | API | お知らせを作成し公開。対象利用者dashboardに表示され、非公開設定は表示されない。 |
| ADMIN-013 | P1 | API | お知らせ本文へHTML/scriptを含める。実行されず安全にescapeされる。 |
| ADMIN-014 | P1 | API | お知らせの固定/公開/表示期間を変える。状態に応じた一覧のみ返る。 |
| ADMIN-015 | P1 | API | U-FREE/U-PREMIUMでdashboard noticeを取得。公開範囲と既読状態を分離して返す。 |
| ADMIN-016 | P0 | API | 一斉メールrouteを非adminから呼ぶ。拒否され、メール送信関数が呼ばれない。 |
| ADMIN-017 | P0 | API | 一斉メール本文をサイズ上限超過/NG内容/不正HTMLで送る。送信前に拒否される。 |
| ADMIN-018 | P1 | API | 送信失敗をモックする。成功件数を水増しせず失敗状態を記録し秘密値をログに出さない。 |
| ADMIN-019 | P1 | 手動 | 問い合わせを送る。宛先設定、受信メール本文、reply-to、個人情報最小化を検証する。 |
| ADMIN-020 | P1 | API | NG wordを含む問い合わせを送る。送信せず日本語エラーを示し、正常文は通す。 |

## 6. Free/Premium・Stripe決済（PLAN: 30件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| PLAN-001 | P0 | API | U-FREEで9件の有効契約を保持し10件目を作る。成功する。 |
| PLAN-002 | P0 | API | U-FREEで有効契約10件の状態から11件目を作る。拒否され、DBは10件のまま。 |
| PLAN-003 | P0 | API | 10件目作成を並行2 requestで競合させる。上限を超えるcommitが発生しない。 |
| PLAN-004 | P0 | API | U-FREEで4カテゴリから5カテゴリ目を作る。成功する。 |
| PLAN-005 | P0 | API | U-FREEで5カテゴリから6カテゴリ目を作る。拒否される。 |
| PLAN-006 | P0 | API | UIの制限を迂回してPremium限定APIを直接呼ぶ。サーバー側が拒否する。 |
| PLAN-007 | P0 | API | Freeの一覧に11件以上のfixtureを持たせて取得する。契約数と隠し件数が正確で、他user分を含めない。 |
| PLAN-008 | P0 | API | U-PREMIUMで11件目を作る。成功し、Free上限の誤適用がない。 |
| PLAN-009 | P0 | API | LIFETIME互換ユーザーをfixture化。Premium権限の判定が既存仕様と整合する。 |
| PLAN-010 | P0 | 手動 | Stripe Test Priceを取得。active、JPY、月1回、licensed、設定額がすべて一致する。 |
| PLAN-011 | P0 | API | Checkout成功URLだけを直接開く。Webhook同期前にPremiumへ変更されない。 |
| PLAN-012 | P0 | API | Checkout POSTを正常実行。Checkout URLはStripe応答由来で、固定/任意URLへ誘導しない。 |
| PLAN-013 | P0 | API | Price ID不正、未設定、削除済み、inactiveを各々検証。安全な日本語エラー、session未作成。 |
| PLAN-014 | P0 | API | Priceがone-time、年額、日額、別intervalのfixture。Checkoutを作成しない。 |
| PLAN-015 | P0 | API | PriceがJPY以外/金額違い/metered。Checkoutを作成せず具体的な設定原因を返す。 |
| PLAN-016 | P0 | API | test keyとlive Price、live keyとtest Priceを組み合わせる。不整合を拒否する。 |
| PLAN-017 | P0 | API | Checkoutで別customerId/userIdを指定する。client値を無視しログイン中の所有者のみを使う。 |
| PLAN-018 | P0 | API | Checkout作成時Stripe API timeoutをmockする。500等の安全応答でFree状態を維持する。 |
| PLAN-019 | P0 | API | 同一ユーザーがCheckoutを短時間に複数回要求。重複契約防止の挙動が明示される。 |
| PLAN-020 | P0 | API | Webhook署名なし/改ざんpayload/誤secretを送る。拒否しplanを変更しない。 |
| PLAN-021 | P0 | API | 正常なsubscription created/updatedを送る。DB状態をStripe eventに同期する。 |
| PLAN-022 | P0 | API | 同じWebhook event IDを2回送る。冪等で一度だけ反映し重複履歴を作らない。 |
| PLAN-023 | P0 | API | 古いeventが新しい状態の後に到着する。status/periodを不当に巻き戻さない。 |
| PLAN-024 | P0 | API | Webhook DB処理中に例外。rollbackし、再配信で安全に完了できる。 |
| PLAN-025 | P0 | API | invoice.paid eventを受信。対象customerの有効契約だけ更新する。 |
| PLAN-026 | P0 | API | invoice.payment_failed eventを受信。支払失敗表示/猶予状態が定義どおりで、誤Premium付与なし。 |
| PLAN-027 | P0 | API | subscription past_due/unpaid/paused/canceled/incompleteを個別同期。entitlementが仕様表と一致する。 |
| PLAN-028 | P0 | API | cancel_at_period_end=trueを同期。期末まではPremium、終了後はFree表示となる。 |
| PLAN-029 | P0 | API | Customer Portal URLを要求。所有Stripe customerだけに紐づき、外部任意URLを許さない。 |
| PLAN-030 | P0 | 手動 | Stripe Test Modeで4242テストカード購入、Webhook、Portal解約を一連確認。Live APIを呼ばない。 |
| PLAN-031 | P1 | API | trial未使用fixtureでCheckoutを開始。trial periodが設定値と一致するときだけ付与する。 |
| PLAN-032 | P0 | API | trialUsedAtありのアカウントでCheckout。2回目trialを要求せず、初回請求日を正しく表示する。 |
| PLAN-033 | P0 | API | trialing status/trial_end futureを同期。DB、設定画面、請求説明が同じ終了日を示す。 |
| PLAN-034 | P1 | API | trial_endが過去/欠損/不正でtrial状態を計算。終了済みを無料期間中と表示しない。 |
| PLAN-035 | P0 | API | trialからactiveへWebhook transition。Premium維持し次回請求/状態表示を更新する。 |
| PLAN-036 | P0 | API | trial中のcancel/past_due/incomplete transition。無料期間文言とPremium権限がStripe状態に整合する。 |

## 7. 契約・カテゴリ・支払い方法（SUB: 35件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| SUB-001 | P0 | API | 必須項目を1つずつ欠落させてcreate。項目別日本語エラーでDB変更なし。 |
| SUB-002 | P0 | E2E | 契約名/価格/周期/次回日だけで登録。成功し一覧へ1件表示する。 |
| SUB-003 | P1 | API | 先頭末尾空白、全角空白、制御文字をname/memoへ送る。正規化または拒否する。 |
| SUB-004 | P1 | API | name/memo/URL各最大長と最大長+1を送る。境界内だけ受理。 |
| SUB-005 | P0 | API | 負額、0円、整数上限超過、小数/指数表記を価格へ送る。仕様にない値を拒否する。 |
| SUB-006 | P0 | API | 不正なcycle、status、frequency、priority enumを送る。DBに不正値を保存しない。 |
| SUB-007 | P0 | API | 不可能日付、曖昧なlocale日付、存在しない年月日を送る。拒否または規定の正規化。 |
| SUB-008 | P0 | API | 31日アンカーを3月に進める。30日月は末日へ寄り、次の31日月でアンカーへ戻る。 |
| SUB-009 | P0 | API | 1/31、3/31、5/31等を基準に複数月を進める。逐次丸めでアンカー日を失わない。 |
| SUB-010 | P0 | API | 閏年の2/29年周期を次年へ進める。2/28に丸め、次の閏年に2/29へ戻る。 |
| SUB-011 | P0 | API | 4/30起点の月次周期を5月・6月へ進める。30日アンカーとして一貫する。 |
| SUB-012 | P0 | API | 31日起点の四半期/半年周期を短月に跨がせる。暦月周期と末日丸めが一致する。 |
| SUB-013 | P1 | API | 年払い2/29、2/28、12/31起点を年境界越しに計算。日付がNaN/翌々日へ飛ばない。 |
| SUB-014 | P1 | API | 週次周期を月末/年末/うるう日越しに進める。7暦日間隔を保つ。 |
| SUB-015 | P1 | API | Custom cycleが1日・上限・null・負数・極端値。許可範囲だけ受理する。 |
| SUB-016 | P1 | API | 日本時間23:59と翌日00:01相当のUTC timestamp。日表示・期限日をJSTで判定する。 |
| SUB-017 | P0 | API | Aの契約IDでBの契約をGET。内容を返さず非存在相当応答にする。 |
| SUB-018 | P0 | API | AがBの契約IDを更新/削除。拒否しBの全フィールドを保持する。 |
| SUB-019 | P0 | API | 更新payloadにuserIdを書き換えて送る。所有者を変更できない。 |
| SUB-020 | P1 | API | 同名サービスを複数登録。別契約として保存され一覧/統計で混同しない。 |
| SUB-021 | P1 | API | service presetをアルファベット順で表示。重複・空値・順序逆転がない。 |
| SUB-022 | P0 | API | categoryIdを他人のカテゴリ/存在しないIDへ指定。拒否し関連付けない。 |
| SUB-023 | P1 | API | カテゴリ未指定契約を保存。未分類としてUI/集計/CSVで一貫表示する。 |
| SUB-024 | P0 | API | カテゴリ削除時に紐付く契約がある。参照制約に従い安全な扱いをする。 |
| SUB-025 | P0 | API | AがBのカテゴリを変更/削除。拒否しB側を維持する。 |
| SUB-026 | P1 | API | 支払い方法を未指定/指定して契約保存。表示とID参照が一致する。 |
| SUB-027 | P0 | API | 他人のpaymentMethodIdを契約に指定。拒否し関連漏えいを防ぐ。 |
| SUB-028 | P1 | E2E | 支払い方法を新規作成・編集・削除する。削除中参照がある場合のUIエラーが明確。 |
| SUB-029 | P1 | API | PaymentMethodType全enum候補を読み込み。日本語表示が一意で未知値は安全なfallback。 |
| SUB-030 | P0 | E2E | 一覧の編集導線を開き、既存値が正しく事前入力される。 |
| SUB-031 | P0 | E2E | 契約を編集し保存。一覧・詳細・カレンダー・分析・支払予定に同じ新値が反映。 |
| SUB-032 | P0 | E2E | 削除確認をキャンセル。契約と全関連情報を保持する。 |
| SUB-033 | P0 | E2E | 契約を削除/論理削除。一覧・検索・カレンダー・分析から除外される。 |
| SUB-034 | P1 | API | 削除済み契約IDを再取得/更新。復活や情報漏えいを許さない。 |
| SUB-035 | P1 | E2E | 解約URLが未設定、空、example.com、HTTP、誤形式。解約ボタンを誤表示しない。 |

## 8. 支払い履歴・カレンダー・集計（PAY: 30件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| PAY-001 | P0 | API | 正常な支払い履歴を作成。契約、user、金額、通貨、支払日が一致する。 |
| PAY-002 | P0 | API | 別userのsubscriptionIdで支払履歴を作る。拒否し履歴を作らない。 |
| PAY-003 | P0 | API | 金額負数、NaN、過大値、不正通貨を送る。validation errorでDB不変。 |
| PAY-004 | P1 | API | 支払日不正、未来日、月末日を送る。仕様どおり拒否/受理しtimezoneずれなし。 |
| PAY-005 | P1 | API | 同じ契約・金額・日付で重複作成。重複防止条件と明示的重複許可が守られる。 |
| PAY-006 | P0 | API | 支払い履歴IDを差替えて他人の履歴を読む/更新/削除。全操作拒否。 |
| PAY-007 | P1 | E2E | 支払いを編集後、対象契約/履歴詳細/累計/CSVに変更が反映される。 |
| PAY-008 | P0 | E2E | 支払い削除をキャンセル。履歴を保持し合計値不変。 |
| PAY-009 | P0 | API | 支払い削除確定。削除対象だけ消え、他契約の履歴は不変。 |
| PAY-010 | P1 | API | 一括科目/証憑整理へ0件、重複ID、他人ID、上限超過を送る。全体を安全に拒否する。 |
| PAY-011 | P1 | E2E | 支払い科目・証憑番号・証憑URLを整理。状態表示と次回利用設定を保存する。 |
| PAY-012 | P0 | API | 証憑URLへjavascript:, data:, file: schemeを指定。拒否する。 |
| PAY-013 | P1 | API | 年払いを月額換算。年額/12が表示値・集計値と一致する。 |
| PAY-014 | P1 | API | 四半期・半年・週次・任意周期の月額換算を検証。丸め方が画面間で共通。 |
| PAY-015 | P1 | API | 支払済み合計、契約見込み、削減実績を同時表示。指標の意味と期間を混同しない。 |
| PAY-016 | P0 | API | A/Bで同額・同日履歴を用意しAの集計を取得。B金額を混ぜない。 |
| PAY-017 | P1 | E2E | 月次支払い合計を選択月で確認。月移動で年月と数値が同期する。 |
| PAY-018 | P1 | E2E | 年次比較を前年・今年のデータで確認。前年なしは推定成長率を捏造しない。 |
| PAY-019 | P1 | API | 空データでグラフを表示。0/未集計の意味が明確でNaN/Infinityを出さない。 |
| PAY-020 | P1 | E2E | 円グラフ/棒グラフをスクリーンリーダー補助文字と併用。凡例と合計が一致。 |
| PAY-021 | P0 | API | カレンダー対象月の月初/月末境界を検証。月初は含み、翌月初は含めない。 |
| PAY-022 | P0 | API | 同日に複数契約の更新を置く。すべて表示し合計を正しく算出する。 |
| PAY-023 | P0 | API | 31日アンカーの月次請求で2月/30日月を表示。月末日に掲載し翌月アンカーを保つ。 |
| PAY-024 | P0 | API | カレンダー2月を平年・閏年で比較。日数・weekday・請求日が正しい。 |
| PAY-025 | P1 | E2E | 前月/次月/今月ボタンを連続押下。タイトル、曜日、日セルが同じ月を表す。 |
| PAY-026 | P1 | E2E | カレンダー日セルの複数契約を開く。各契約の名称・金額・周期を取り違えない。 |
| PAY-027 | P1 | API | カレンダーCSVを出力。全対象日と予定項目がUIと一致する。 |
| PAY-028 | P1 | E2E | 画面幅320px、契約数多、同日多数でもカレンダーが横にはみ出さず操作可能。 |
| PAY-029 | P1 | API | 100/400 occurrence上限の前後の長期間を列挙。処理上限を守り停止せず不正無限loopなし。 |
| PAY-030 | P1 | API | 不正期間 end<=start/invalid dateで照会。空配列等の安全応答、例外500なし。 |

## 9. CSV・明細取込・出力（CSV: 24件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| CSV-001 | P1 | E2E | CSV入出力説明ポップアップを開く。各日本語列名と対応入力欄が示される。 |
| CSV-002 | P1 | E2E | 入力説明で1行目がヘッダーであること、ヘッダーなし時の扱いを読む。曖昧な説明がない。 |
| CSV-003 | P1 | API | 正常なUTF-8 CSVをpreview。値を保存せず件数・候補・警告を返す。 |
| CSV-004 | P1 | API | BOMありUTF-8、CRLF、LFを入力。日本語列名・値が文字化けしない。 |
| CSV-005 | P1 | API | ヘッダーあり/なしCSVをそれぞれpreview。列位置の判定が規則どおり。 |
| CSV-006 | P1 | API | 列順入替、余分列、欠落列、未知ヘッダー。マッピングまたは行エラーを明示する。 |
| CSV-007 | P0 | API | 不正行と正常行混在CSVを取込preview。確定前に行ごとの結果を示し勝手に部分保存しない。 |
| CSV-008 | P0 | API | preview token/IDを他ユーザーのsessionで確定。拒否し元userの内容も変えない。 |
| CSV-009 | P0 | API | preview後に内容を改ざんした確定requestを送る。サーバーで再検証し改ざん値を保存しない。 |
| CSV-010 | P1 | API | 同じCSVを二重確定。重複契約を作らないか、明確な重複確認フローを要求する。 |
| CSV-011 | P1 | API | 価格、日付、周期、無料期間、カテゴリの境界/不正値。行番号と項目名を返す。 |
| CSV-012 | P0 | API | CSV cellに`=`, `+`, `-`, `@`から始まる式を登録しexport。Excel formula injectionを抑止する。 |
| CSV-013 | P0 | API | CSV値に引用符、カンマ、改行、二重引用符を入出力。セル境界を壊さない。 |
| CSV-014 | P1 | API | 0行、ヘッダーのみ、巨大行、巨大ファイル、列数過多。制限内エラーを返しmemory枯渇なし。 |
| CSV-015 | P1 | E2E | 契約テンプレートをダウンロード。文字コード、ヘッダー、説明と実schemaが一致する。 |
| CSV-016 | P1 | API | 契約CSVをexportして再import preview。主要fieldがlossなく保持される。 |
| CSV-017 | P0 | API | A userでexport。AのデータだけでB、admin、secret情報を含まない。 |
| CSV-018 | P1 | API | 支払いCSVの日本語ヘッダー、日付、金額、通貨、契約名称を照合する。 |
| CSV-019 | P1 | API | 年/月フィルターを欠落、不正、未来値で送る。デフォルト/拒否が定義どおり。 |
| CSV-020 | P1 | API | account data exportに全対象リソースを含め、password hash/token/session secretを含めない。 |
| CSV-021 | P1 | API | account data exportでBのIDやqueryを指定。B dataを含めない。 |
| CSV-022 | P1 | API | ファイル名にUnicode、quote、CRLFを含む年月/ユーザー値を入力。header injectionがない。 |
| CSV-023 | P1 | E2E | download responseをキャンセル/再試行。二重登録/画面遷移ループが発生しない。 |
| CSV-024 | P1 | E2E | 出力CSVをExcel相当/表計算ソフトで開く。日本語、先頭0、金額、日付が読める。 |

## 10. 利用実績・見直し・解約・削減（REVIEW: 25件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| REVIEW-001 | P1 | API | 今日の利用記録を作成。対象subscriptionとJST日付で一意に紐づく。 |
| REVIEW-002 | P1 | API | 同日同契約の利用記録を二重送信。重複防止ルールが守られる。 |
| REVIEW-003 | P1 | API | 将来日/不正日/別user subscriptionで記録。拒否しDBを変更しない。 |
| REVIEW-004 | P0 | API | U-AからU-Bのusage IDを作成/更新/削除。全て拒否。 |
| REVIEW-005 | P1 | API | 日次利用0/1/複数回を記録し日別集計。JST午前0時境界で翌日にずれない。 |
| REVIEW-006 | P1 | API | 週次使用量レンジの4値を各保存。範囲外・文字列を拒否する。 |
| REVIEW-007 | P1 | E2E | 利用頻度/優先度/見直し日を契約へ保存。再読み込み後も保持する。 |
| REVIEW-008 | P1 | API | 契約未利用判定の30/60/90日境界。境界日の直前/当日/翌日を正しく分類する。 |
| REVIEW-009 | P1 | API | 登録直後で利用履歴なしの契約。未利用警告を誤表示しない。 |
| REVIEW-010 | P1 | API | 同カテゴリ複数契約の重複/類似判定。未分類同士を誤統合しない。 |
| REVIEW-011 | P1 | API | review score各要因を単独で変更。理由、点数、上限/下限が一致する。 |
| REVIEW-012 | P1 | API | データ欠落、未知利用頻度、未来見直し日でscore。推測値で高得点にしない。 |
| REVIEW-013 | P1 | API | renewal decisionの継続/保留/解約予定を記録。状態と日時を保存する。 |
| REVIEW-014 | P0 | API | 同一契約decisionを二重送信/競合更新。重複履歴や矛盾状態を作らない。 |
| REVIEW-015 | P1 | API | 削減予測を算出。継続判断、未確定候補を確定削減実績に混ぜない。 |
| REVIEW-016 | P1 | API | 月額・年額・週次支払いの削減見込を換算。実績金額と予測を別表示する。 |
| REVIEW-017 | P1 | API | 削減候補を解約完了へ進める。実行日時以降の期間だけ継続削減へ計上。 |
| REVIEW-018 | P1 | API | 未来の解約完了日をfixture化。現在までの実績へ加算しない。 |
| REVIEW-019 | P1 | API | 過去12か月の削減タイムライン。月境界、年越し、年払い換算が正しい。 |
| REVIEW-020 | P1 | E2E | 断捨離challengeを月ごとに回答。重複回答防止と履歴表示が正しい。 |
| REVIEW-021 | P0 | API | 解約チェックリストの項目を追加/完了/再開。所有者とsubscriptionを検証する。 |
| REVIEW-022 | P0 | API | Checklist IDをA/Bで差し替え。情報・変更結果を漏らさない。 |
| REVIEW-023 | P1 | API | 解約証跡に日時/URL/メモを保存。危険schemeと過長入力を拒否する。 |
| REVIEW-024 | P1 | E2E | 解約支援ボタンを使い、公式外部ページを新規tabで開く。自動解約を実行しない。 |
| REVIEW-025 | P0 | 手動 | 外部サービスの実契約をキャンセルしないテストで、UIが解約済みを誤記録しないことを確認。 |

## 11. 契約関連ニュース・サービスカタログ（NEWS: 25件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| NEWS-001 | P1 | API | U-Aに契約サービスXのみ登録しニュース一覧を取得。Xに対応する記事だけ返す。 |
| NEWS-002 | P0 | API | 未契約サービスYの記事だけがある。U-AにY記事を推薦/露出しない。 |
| NEWS-003 | P1 | API | 契約0件ユーザーでニュース取得。無関係記事を返さず空状態/実装済み推薦だけを表示する。 |
| NEWS-004 | P0 | API | U-Aの契約とU-BのNewsItemを混在させる。U-AレスポンスにBのprivate/news personalizationを含めない。 |
| NEWS-005 | P1 | API | 同一記事を複数RSSで取得。canonical/url/hash規則で二重表示しない。 |
| NEWS-006 | P1 | API | 見出し、公開日、source、本文概要を返す。欠損値は安全なfallbackになり記事を誤生成しない。 |
| NEWS-007 | P1 | API | ニュース詳細をクリック。IDと所有/公開条件を検証し該当本文だけを表示する。 |
| NEWS-008 | P1 | API | 10件ページングの1ページ目/2ページ目。重複・抜け・順序逆転がない。 |
| NEWS-009 | P1 | API | 最終ページ/空ページ/負offset/巨大pageを指定。境界を制限し安全な応答を返す。 |
| NEWS-010 | P1 | API | 更新時刻を同一にした記事を取得。安定したsort順でページ跨ぎ重複を防ぐ。 |
| NEWS-011 | P1 | API | 古い過去記事を取得。掲示板型履歴として保存済み記事が消えず表示される。 |
| NEWS-012 | P1 | API | 手動「最新情報を取得」を一度押す。受付状態/更新日時を表示し成功時に記事を再読込する。 |
| NEWS-013 | P1 | API | 手動同期を連打/同時実行。rate limit/lockが働き上流RSS呼出が増殖しない。 |
| NEWS-014 | P1 | API | 手動同期が全source timeout。既存記事を消さず、実行失敗状態と再試行可能性を示す。 |
| NEWS-015 | P1 | API | 一部source成功・一部失敗。成功記事は保持し、部分失敗を全成功と偽らない。 |
| NEWS-016 | P1 | API | RSS itemにHTML anchor、font、script、CDATAを含める。本文は安全なtextとして保存しtag文字列を露出しない。 |
| NEWS-017 | P0 | API | article URLにjavascript/data/file/private IPを指定。fetch/リンク遷移しない。 |
| NEWS-018 | P1 | API | source日付がJST午前0時境界/欠損/不正。日別上限と表示日が決定的である。 |
| NEWS-019 | P1 | API | 1ユーザー/1日上限の直前・上限・上限+1件を作る。制限どおりで記事を無制限に保存しない。 |
| NEWS-020 | P1 | API | 英語記事を入力。現在の日本語ソース/翻訳方針に従い、英語一行だけをそのまま完成記事として出さない。 |
| NEWS-021 | P1 | API | 本文を指定行数相当に生成/整形。内容は見出しだけの薄い一行にならず、根拠のない事実を補わない。 |
| NEWS-022 | P1 | API | 記事に公式sourceが無い/壊れたURL。source linkを表示しないか不明として処理する。 |
| NEWS-023 | P0 | API | 利用者がadmin sync APIを直接呼ぶ。一般ユーザー/デモは拒否される。 |
| NEWS-024 | P1 | API | feedbackを送る。重複・他人のnewsId・不正enumを検証し個人ごとに保存する。 |
| NEWS-025 | P1 | E2E | dashboardのToday直下にユーザー関連ニュースを表示し、一覧/詳細へ遷移。無関係公式サイト一覧を出さない。 |

## 12. Gemini比較分析・AI提案（AI: 20件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| AI-001 | P0 | API | U-FREEがanalysis endpointを呼ぶ。Premium限定として拒否し、Gemini API callなし。 |
| AI-002 | P0 | API | U-PREMIUMでconsent=true、有効契約あり。本人の対象データだけで分析を開始する。 |
| AI-003 | P0 | API | consent欠落/false/文字列true。400で拒否し、Gemini requestを送らない。 |
| AI-004 | P0 | API | API key未設定/空/placeholder。503を返し、外部callをせず設定の安全な説明を返す。 |
| AI-005 | P0 | E2E | page source、client bundle、browser networkを検査。GEMINI_API_KEY/API keyを一切出さない。 |
| AI-006 | P0 | API | U-Aに契約A、U-Bに契約Bを作る。A requestのGemini inputにBのname/id/priceを含めない。 |
| AI-007 | P1 | API | cancelled/deleted subscriptionを保持し分析。ACTIVEかつ未削除のものだけ選ぶ。 |
| AI-008 | P1 | API | 対象上限未満/上限/上限超過の契約を準備。上限を超えず、選定順はmonthly price降順。 |
| AI-009 | P0 | API | Gemini送信payloadをmock capture。email、password、memo、支払い履歴、カード情報を含めない。 |
| AI-010 | P1 | E2E | consent文を表示して同意を明示操作。未選択時は送信せず、送信情報の概要が理解できる。 |
| AI-011 | P1 | API | 不正JSON/unknown key/巨大bodyを送る。Zod/body limitで拒否しquota消費しない。 |
| AI-012 | P1 | API | Gemini timeout/429/5xxをmock。502等の日本語エラー、内部stackやAPI keyなし。 |
| AI-013 | P1 | API | Gemini malformed JSON/schema違反を返す。結果を信用せず拒否し保存しない。 |
| AI-014 | P0 | API | Gemini responseに別userのsubscription IDを混ぜる。sanitizeして候補から除外する。 |
| AI-015 | P0 | API | GeminiがpotentialMonthlySavingsを実価格より大きく返す。算出額をserverで上限補正する。 |
| AI-016 | P1 | E2E | AI recommendationの理由へHTML/script文字列を含める。実行せずtextとして表示する。 |
| AI-017 | P1 | API | 1時間あたり上限の直前・到達・超過を制御clockで確認。超過は429+Retry-After、外部callなし。 |
| AI-018 | P1 | API | 1日あたり上限の直前・到達・超過を確認。過去24h範囲とRetry-Afterが正しい。 |
| AI-019 | P0 | API | 同一userの同時requestでrate limitを競合させる。並列で上限を超えず二重請求相当を抑止する。 |
| AI-020 | P1 | E2E | 契約詳細の操作からAI提案を開く。対象契約が明確で、固定代替リストをAI結果と誤認させない。 |

## 13. 通知・メールジョブ・配信履歴（NOTICE: 20件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| NOTICE-001 | P1 | API | 更新日の設定通知日数前にfixture clockを固定。対象契約だけが通知候補になる。 |
| NOTICE-002 | P1 | API | 無料期間終了日と解約期限を別設定。各イベント種別と通知日を取り違えない。 |
| NOTICE-003 | P0 | API | 同じuser/subscription/deadlineを同一ジョブで2回評価。配信は一度だけ。 |
| NOTICE-004 | P0 | API | 同じジョブを並列2 workerで開始。DB claim/unique制約により一回だけ送る。 |
| NOTICE-005 | P1 | API | 契約通知をpause。期限一致しても送信せずskip理由を保存する。 |
| NOTICE-006 | P1 | API | snooze期間中/終了直後を比較。期間中は送らず終了後に再開する。 |
| NOTICE-007 | P1 | API | 利用設定未作成ユーザー。既定値を一貫適用し全通知を誤って停止しない。 |
| NOTICE-008 | P1 | API | 月次summaryの同一月を複数回実行。ユーザー/月単位で重複しない。 |
| NOTICE-009 | P1 | API | Free userでPremium限定monthly summary。plan gateで送信しない。 |
| NOTICE-010 | P1 | API | subscription 0件でも送るべき月次実績があるケース。履歴基準で適切なsummaryを送る。 |
| NOTICE-011 | P0 | API | job endpointをtokenなし/不正tokenで呼ぶ。拒否し一件も送らない。 |
| NOTICE-012 | P0 | API | bearer tokenをquery/header別名に付ける。不許可な認証経路を受け付けない。 |
| NOTICE-013 | P1 | API | 認証成功ジョブが処理途中で失敗。成功/失敗/skip数とlastRunを正確に保存する。 |
| NOTICE-014 | P1 | API | 送信クライアント429/5xx/timeoutを個別mock。再試行方針・attempt数・冪等keyが規則どおり。 |
| NOTICE-015 | P0 | API | Resend再試行で同じidempotency keyを使う。二重メールを防ぐ。 |
| NOTICE-016 | P1 | API | SMTP送信失敗後にジョブ再実行。未送信と送信済みを区別し重複送信しない。 |
| NOTICE-017 | P1 | API | 通知本文にname/service/memoのHTML payload。メールHTMLをescapeする。 |
| NOTICE-018 | P1 | E2E | delivery historyを見る。送信0件、never、日時、通知日数が日本語で理解できる。 |
| NOTICE-019 | P1 | 手動 | Resend/SMTPを使う専用検証アカウントへ単発送信。到達、From、SPF/DKIM、本文を確認する。 |
| NOTICE-020 | P1 | 手動 | cronを手動dry run後に1回だけ実行。health、ログ権限、タイムゾーン、ポートを記録しsecretをログに残さない。 |

## 14. 設定・アカウント・個人情報（SETTING: 20件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| SETTING-001 | P0 | E2E | 一般ユーザー設定を開く。一般設定を表示し管理機能を表示しない。 |
| SETTING-002 | P1 | E2E | 名前・予算・通知時間を変更。保存表示と再読み込み後の値が一致する。 |
| SETTING-003 | P0 | API | 他user ID/emailをprofile update payloadに入れる。所有者email/nameを変更しない。 |
| SETTING-004 | P1 | API | budgetが空/0/負/上限超過/decimal。許容値だけ保存する。 |
| SETTING-005 | P1 | API | 通知時刻、timezone相当値の境界/形式不正を送る。UTC/JSTを二重変換しない。 |
| SETTING-006 | P0 | E2E | 現在password誤りでpassword変更。拒否して旧passwordを維持する。 |
| SETTING-007 | P0 | E2E | 新password/確認が不一致。項目特定日本語error、変更なし。 |
| SETTING-008 | P0 | API | 現在password正解、新password基準違反。拒否してsession/passwordHash不変。 |
| SETTING-009 | P0 | API | 正常password change。DBにはbcrypt等の遅延ハッシュを保存し平文・SHA1/MD5を保存しない。 |
| SETTING-010 | P0 | API | email change申請だけでログインemailを更新できない。確認token発行後も旧emailが有効。 |
| SETTING-011 | P0 | API | email change token期限切れ/再使用/他人使用。新emailへ切替しない。 |
| SETTING-012 | P1 | 手動 | 検証メールアドレス変更を完了。確認メール到達、新email表示、旧email失効、session挙動を確認する。 |
| SETTING-013 | P0 | E2E | account deleteに確認操作なし/文字列不一致。削除しない。 |
| SETTING-014 | P0 | API | 一般ユーザーが他人アカウント削除APIを呼ぶ。拒否しcascadeなし。 |
| SETTING-015 | P0 | API | U-DEMO/U-ADMINでaccount deleteを試す。拒否しユーザー行と関連行を保持する。 |
| SETTING-016 | P0 | API | Stripe active Premium accountの削除を要求。契約状態と合意済み手順を確認せずデータを先に削除しない。 |
| SETTING-017 | P0 | API | 削除成功fixture。全cascade対象とsessionを削除し、再ログイン不可能。 |
| SETTING-018 | P1 | API | account data export後にJSON parse/schema確認。password hash、token、cookie、Stripe secretなし。 |
| SETTING-019 | P1 | E2E | 設定画面下部のFAQ/法務/問い合わせリンクを開く。ログアウトは設定内に残りリンクと競合しない。 |
| SETTING-020 | P1 | E2E | save中二重クリック/通信断。二重変更なく、再試行後に一貫した状態へ戻る。 |

## 15. DB・マイグレーション・データ保全（DB: 20件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| DB-001 | P0 | API | DB runnerが`*_test`/許可CI名のみ許可することを負例/正例で確認する。 |
| DB-002 | P0 | API | database名が`subsclist`でhostがlocalhost。root相当でも拒否される。 |
| DB-003 | P0 | API | suffix `_test`だが外部host。拒否され接続を開始しない。 |
| DB-004 | P0 | API | DATABASE_URL欠落/parse不能/port不正。開始前に秘密を伏せた診断を返す。 |
| DB-005 | P0 | API | 誤ったDB接続時にmigration/drop/truncateを実行しない。guardでfail closed。 |
| DB-006 | P1 | API | schema validate/generate後にclient modelとmigration schemaが一致する。 |
| DB-007 | P0 | API | `migrate deploy` dry/preflightで未適用migrationを識別し、開発用resetを使わない。 |
| DB-008 | P0 | API | migration safety checkで未対応column dropがあるfixtureを拒否する。 |
| DB-009 | P0 | API | pending unique Stripe indexに重複fixtureを与える。migration前に停止する。 |
| DB-010 | P0 | API | migration history failed/partial/unexpected state。自動repairせずfail closed。 |
| DB-011 | P0 | API | savings dedupe migrationへ既存行を与える。connection-scoped temp tableのbackfillが既存値/行を保持する。 |
| DB-012 | P1 | API | backfillを同じ入力で再実行。dedupe keyが決定的で一意。 |
| DB-013 | P0 | API | User deleteのcascade対象をfixture化。仕様対象だけ消え、Stripe外部契約の状態は別途明示する。 |
| DB-014 | P0 | API | Subscription deleteのcascade/SetNullを照合。支払い履歴の保持規則に反しない。 |
| DB-015 | P0 | API | owner scoped reads/writesの12種類データでU-A/B間の越境がない。 |
| DB-016 | P1 | API | unique(email)、token hash、Stripe IDs、dedupe keyに重複を試みる。DB制約が最後の防御となる。 |
| DB-017 | P1 | API | transaction中の2段目writeを故意に失敗。1段目writeもrollbackする。 |
| DB-018 | P1 | API | pool枯渇/DB timeout/mock connection refusal。無限再試行せず安全なエラーとログを残す。 |
| DB-019 | P1 | API | FK先削除と同時writeを競合。partial orphan/他人関連付けを作らない。 |
| DB-020 | P0 | 手動 | テスト後に`subsclist_test`接続先を再確認し、本番DB名・production data・row countが影響を受けていないことを確認する。 |

## 16. 可用性・アクセシビリティ・互換性・性能（NFR: 22件）

| ID | 優先 | 方法 | 手順・期待結果 |
|---|---|---|---|
| NFR-001 | P1 | E2E | 320px幅で各主要ページを開く。横scrollWidthがviewportを超えない。 |
| NFR-002 | P1 | E2E | 200% zoomで登録/決済/保存操作。ボタンや重要文言が隠れない。 |
| NFR-003 | P1 | E2E | Tab/Shift+Tab/Enter/Spaceで公開・認証・契約フォームを操作できる。 |
| NFR-004 | P1 | E2E | validation errorへfocus/aria-describedbyが関連づき、どのfieldが不足か支援技術が読める。 |
| NFR-005 | P1 | E2E | 色を失ってもstatus/graph/plan差がテキストまたは形状で判別できる。 |
| NFR-006 | P1 | E2E | ボタン二重送信防止中、loading/statusを読み上げ可能で操作停止が視認できる。 |
| NFR-007 | P1 | 手動 | Firefox、Chrome、Edge最新安定版でlogin、CSV、calendar、Stripe redirect前画面を確認する。 |
| NFR-008 | P1 | E2E | 320/375/768/1280/1920px screenshot比較。文字・グラフ・メニューが重ならない。 |
| NFR-009 | P1 | 手動 | iOS Safari/Android Chrome相当でPWA install、manifest、アイコン、safe areaを確認する。 |
| NFR-010 | P1 | 手動 | Service Worker更新後もauth/private responseをcacheから表示しない。ログアウト後の戻る操作で個人情報なし。 |
| NFR-011 | P1 | 手動 | 低速3G/高latencyでlogin・保存・CSV表示。timeoutと再試行案内が正しく二重writeなし。 |
| NFR-012 | P1 | 手動 | API route p95を定義済み負荷条件で測定。通常CRUD p95 1秒以内を初期目標とし超過を記録。 |
| NFR-013 | P1 | 手動 | dashboardに契約100件/履歴1,000件。p95 3秒以内、集計欠落なしを確認。 |
| NFR-014 | P1 | 手動 | 1,000行CSV preview/exportで処理時間・memoryを記録し、request timeout/body limitを越えない。 |
| NFR-015 | P1 | 手動 | 100並行read、20並行writeの負荷を専用環境で実施。DB pool、5xx、重複作成を記録する。 |
| NFR-016 | P1 | 手動 | upstream RSS timeout/壊れたXML/redirectを入力。アプリ全体が遅延せず、既存ニュースを保つ。 |
| NFR-017 | P1 | 手動 | Resend/SMTP/Stripe/Geminiが停止。関係しない画面とCRUDが継続し安全なエラー表示。 |
| NFR-018 | P0 | 手動 | production build後にhealth endpointが200、詳細情報/環境値を返さない。 |
| NFR-019 | P1 | 手動 | process再起動後のsession、既存データ、cron履歴が維持される。PM2を重複起動しない。 |
| NFR-020 | P1 | 手動 | 日本語text、濁点、emoji、CJK、Unicode combining文字を各入力/CSV/exportで保持する。 |
| NFR-021 | P0 | 手動 | error monitoring/log outputを点検。stacktraceとsecretは外へ出ず、運用識別子だけ記録。 |
| NFR-022 | P1 | 手動 | WCAG AA相当の文字contrast、focus visible、landmark/heading順を主要PC/モバイル画面で検査する。 |

## 17. API Route網羅表

本表は実装Routeの存在を列挙する棚卸しであり、各Routeを正常系/認証/権限/validation/異常系で検証済みと示すものではない。未対応Routeは本書の該当領域へケース追加する。

| 領域 | 現行Route |
|---|---|
| 認証 | `/api/auth/{register,login,logout,verify-email,resend-verification,forgot-password,reset-password,verify-email-change,google/start,google/callback,demo-login}` |
| Admin/System | `/api/admin/{me,bulk-email,news/daily,news/sync,prices/sync}`, `/api/system/status` |
| Subscription | `/api/subscriptions`, `/api/subscriptions/[id]`, `/api/subscriptions/bulk`, `/api/subscriptions/[id]/{usage,usage/today,usage/weekly,notifications/snooze,review-score,renewal-decision,scheduled-price,service-master,statement-aliases}` |
| Payment/Category | `/api/payment-histories`, `/api/payment-histories/[id]`, `/api/payment-histories/bulk`, `/api/payment-methods`, `/api/categories`, `/api/monthly-close`, `/api/savings`, `/api/savings-events`, `/api/saving-challenges` |
| Import/Export | `/api/import/{template,statement-sample,candidates,payments,payments/[id],subscriptions,subscriptions/preview}`, `/api/export`, `/api/export/{account-data,calendar,monthly-payments,payments,savings-events}` |
| Service/News | `/api/services`, `/api/services/[id]/{alternatives,news,prices}`, `/api/service-watchlist`, `/api/service-watchlist/[serviceId]`, `/api/news`, `/api/subscription-news/sync`, `/api/subscription-news/[id]/{feedback,view}` |
| Stripe/AI | `/api/stripe/{checkout,portal,sync,webhook}`, `/api/gemini/analysis` |
| Settings/Contact/Notifications | `/api/settings/{account,budget,email,password,plan,profile,security/sessions}`, `/api/contact`, `/api/notifications/send`, `/api/cancellation-checklist/[id]`, `/api/cancellation-evidences`, `/api/cancellation-evidences/[id]`, `/api/today` |

各Routeのテストでは少なくとも、未認証、未認証メール、Free、Premium、admin、demo、所有者A/B、欠落/不正body、巨大body、CSRF不正、依存先障害の該当パターンを確認する。HTTP methodの未対応、404/405、content-type、cache-control、response schemaも対象とする。

## 18. 実施順・合否・記録

### 18.1 実施順

1. 作業tree/Node/Next/PrismaのversionとDB URLを記録し、test DB名が許可suffixであることを別担当者または独立コマンドで確認する。
2. `npx prisma validate`、`npm run test:db-guard`、unit/security testsを実行する。
3. `npm run test:routes:coverage`、`npm run test:db-isolation`、`npm run test:migration-backfill`、`npm run audit:stripe`をtest DBで実行する。
4. Playwright用の外部送信無効設定を適用し、`npm run test:e2e`をPC/モバイルで行う。
5. lint、typecheck、本番相当build、依存auditを実行する。Next.jsのtsconfig自動変更を差分確認し、テスト専用の追記だけ除去する。
6. Stripe/Resend/Googleの外部結合は、Test/sandboxアカウントと明示的に承認された専用recipientだけで別実施する。Live決済や本番ユーザー宛メールは本仕様の自動実行対象外。
7. 結果を記録し、P0/P1の未解決項目、試験不可理由、残存リスクをレビューする。

### 18.2 標準コマンド

```text
npm ci
npx prisma validate
npm run test:db-guard
npm test
npm run test:usage
npm run test:routes:coverage
npm run test:db-isolation
npm run test:migration-backfill
npm run audit:stripe
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
npm audit --audit-level=high
```

DBがない場合はDB/API/E2E項目を未実施とし、skipを合格に数えない。通常権限のWindowsでNext/Vitest一時ファイルの`EPERM`が起きた場合は原因とtest DBの安全性を確認し、許可された隔離環境で再実行する。実行前にproduction `.env`を読み込ませず、`npm run prisma:migrate`/reset/db pushをproductionへ実行しない。

### 18.3 合格条件

- P0全件合格。未実施・skip・blockedを合格扱いしない。
- P1に未解決のデータ、認証、金額、ニュース関連性、ユーザー向け日本語誤りがない。
- Stripe checkout entitlementはWebhook状態を根拠にし、Test/Liveの混同がない。
- 他ユーザー情報・secret漏えい、誤送信、意図しないDB破壊が0件。
- unit/API/DB/E2E/type/lint/buildを同じ候補ソースで実行して記録する。
- 外部サービス未試験は明示し、自動テスト合格で配信到達/決済成立を推定しない。

### 18.4 実行記録テンプレート

| 項目 | 記録 |
|---|---|
| 候補識別子/commit SHA |  |
| 作業tree cleanか、差分数 |  |
| 実施日時/担当者/OS/ブラウザー |  |
| Node/Next/Prismaバージョン |  |
| DB名（secretを除くhost/port） |  |
| case IDと合否/未実施理由 |  |
| fail件数、再現手順、issue |  |
| P0/P1残件・リスク受容者 |  |
| 実メール/Stripe/Google接続の有無 |  |
| 結果証跡の保存先（PII/secret除去） |  |

## 19. 実装・テスト対応の参照

- APIテスト: `tests/routes/`（現時点48ファイル）、ケース一覧は本書のAPI網羅表とIDでトレースする。
- Browser E2E: `tests/e2e/`（現時点3 spec、PC/モバイルmatrix）。`PUB`、`ADMIN`、`SUB`、`SETTING`、`NFR`ケースを拡張する。
- 単体/セキュリティ: `src/lib/*.test.ts`、`scripts/lib/*.test.*`。計算、validation、CSRF、session、rate limitを対応する。
- DB/移行: `scripts/run-db-tests.cjs` と `prisma/migrations/`。実行先をtest DBに固定し、破壊操作はconnection guardで拒否する。
- 主要UI: `src/app/**/page.tsx`、APIは`src/app/api/**/route.ts`、データ定義は`prisma/schema.prisma`。実装にない機能は期待結果として追加せず、要件変更として別記録する。

## 20. 仕様作成時点の境界

この文書はテスト計画であり、全381項目の実行記録ではない。テストコードの追加、CI/CD実行、GitHub変更、本番DB接続、実メール送信、Stripe Live決済、公開デプロイは行っていない。実装/外部設定を変更した場合は、関係する期待値・ケース・fixtureをレビューしてから実施する。
