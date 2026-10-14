# SubscList テスト実行記録

- 実施日: 2026-10-13 (JST)
- 対象仕様: [詳細テスト仕様書](./SUBSCLIST_DETAILED_TEST_SPEC_2026-10-13.md)
- 対象環境: Windows 開発環境、ローカル隔離テストDB (`*_test`)
- 公開環境への接続・変更: なし
- Git commit / push / CI/CD / deploy: なし

## 結果

| 検査 | 結果 | 詳細 |
|---|---|---|
| DB接続先ガード | PASS | 29 tests passed。本番名DB・外部DBを拒否する条件を確認 |
| `npm test` | PASS | 登録済み単体・Routeメール・セキュリティ回帰スイートが完了。メールRoute 6件を含む |
| `npm run test:usage` | PASS | 2 tests passed |
| Prisma schema | PASS | `npx.cmd prisma validate` |
| Lint | PASS | `npm run lint` |
| TypeScript | PASS | `npx.cmd tsc --noEmit`。E2E後にも再実行 |
| Route/API + coverage | PASS | 48 files / 311 tests。Line coverage 70.86% |
| DB owner isolation | PASS | 12種類の所有データ分離、認証トークン一回取得、途中失敗時のrollback、DB件数維持 |
| Migration backfill | PASS | 4種類のバックフィルを接続スコープ一時テーブルで確認 |
| Stripe identifier audit | PASS | 重複グループ0。ただしテストDBにユーザー・Stripe IDはなく、既存本番データの監査結果ではない |
| Production build | PASS | E2Eランナー内の `next build --webpack` 成功。103 routes生成 |
| Browser E2E | PASS | Playwright desktop/mobile 各14、合計28 tests passed |
| Dependency audit | PASS | `npm audit --audit-level=high`: 0 vulnerabilities |
| Diff whitespace | PASS | `git diff --check` |

## 実施内容・安全境界

- DB系テストはローカル `*_test` DBに限定し、`subsclist` 等の本番名DBや外部ホストへ接続していない。
- 実メール配信、Stripe API/決済、Google OAuthプロバイダー、Gemini APIへの実接続は行っていない。モック・スタブテストのPASSは外部サービスの稼働や到達性を証明しない。
- ビルド/E2Eはローカルのテスト環境で実行した。公開環境のデプロイ・プロセス再起動・データ変更は行っていない。
- テスト実行時にNext.jsが `tsconfig.json` を整形し、今回の `.next-e2e` includeを追記したため、その自動変更だけを除去した。既存の `.next-*` include等、今回以前の設定は保持した。`tsconfig.json` には作業開始前からの変更が残っている。
- Vitest/Next.jsのOS管理TEMPでrenameが拒否されたため、承認済みのローカル隔離実行としてリポジトリ内の専用TEMPを使った。終了後に専用TEMPを削除した。

## 未実施・要確認

詳細仕様書の全381項目を個別に実行したわけではない。以下は今回未実施であり、リリース可否を確定するには別途確認が必要。

- Resendの専用検証宛先への実メール送信・受信・リンク到達確認（メール送信枠を消費するため実施せず）
- Stripe Test ModeでのCheckout、Webhook再送、Portal、トライアル・解約・返金を実アカウントで確認
- Google OAuth Console設定を伴う実ログイン/拒否/コールバック確認
- 実端末（iOS Safari / Android Chrome）でのPWA追加、Service Worker更新、オフライン挙動
- Firefox/Chrome/Edgeの全てでの手動クロスブラウザー確認
- 低速回線、負荷（並行読取/書込）、p95測定、メモリ測定
- WCAG AA相当の主要画面全体の手動コントラスト・キーボード・読み上げ確認
- テスト後の本番環境不変性確認（本番へ接続していないため変更操作はないが、本番DBを直接照会していない）
- 381項目のうち既存自動化に対応づいていない各項目の手動記録

## 判定

今回実行した自動テスト、隔離DB検査、ビルド、desktop/mobile E2Eはすべて成功。これは仕様書381項目全体の合格や、実メール・実決済・実OAuthを含むリリース承認を意味しない。外部サービスと実端末・性能に関する未実施項目を検証し、詳細仕様書の各ケースへ個別の実行結果を追記してから最終判定する。
