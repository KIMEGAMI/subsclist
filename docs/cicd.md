# CI/CD 運用手順

## 結論

SubscList は、CIでテスト・ビルド・セキュリティ検査を通してから、手動承認付きCDで本番へデプロイします。

CDは最初から自動実行にしません。まず GitHub Actions の `Deploy production` を手動実行し、GitHub Environment `production` の承認を挟む運用にします。

## CIで実行する内容

`.github/workflows/ci.yml` で以下を実行します。

- `npm ci --ignore-scripts`
- Playwright用Chromeのインストール
- Prisma Client生成
- CI用MySQLへのmigration適用
- ESLint
- ユニットテスト、セキュリティ回帰テスト
- API route統合テストとcoverage
- マルチユーザーDB分離テスト
- Stripe customer / subscription ID監査
- 本番ビルド
- E2Eブラウザテスト
- `npm audit --audit-level=high`

`.github/workflows/security.yml` で以下を実行します。

- Dependency Review
- CodeQL
- Semgrep SAST
- Gitleaks秘密情報スキャン
- actionlintによるGitHub Actions workflow検証

Dependabotでnpm依存とGitHub Actionsの更新PRも週次で作成します。

## CDの方針

`.github/workflows/deploy.yml` は `workflow_dispatch` の手動実行のみです。

流れは以下です。

1. GitHub Actions上でデプロイ前検証を実行する。
2. `production` environment の承認を待つ。
3. SSHで本番サーバーへ接続する。
4. サーバー上で `git pull --ff-only`、`npm ci`、Prisma Client生成、必要ならmigration、本番buildを実行する。
5. PM2で `subsclist` を reload または start する。
6. サーバー内から `http://127.0.0.1:3000` の応答を確認する。

## GitHub Environment の作成

GitHubリポジトリで以下を設定してください。

1. `Settings` を開く。
2. `Environments` を開く。
3. `New environment` で `production` を作成する。
4. 可能なら Required reviewers を設定する。
5. Environment secrets に後述のSSH情報を登録する。

GitHubのEnvironment secretsは、そのenvironmentを参照するjobでのみ使えます。承認ルールを設定した場合、承認されるまでsecretsはjobに渡されません。

## SSH鍵の作成

ローカルPCでデプロイ専用鍵を作成します。本番サーバーのログインパスワードや既存秘密鍵をGitHubへ入れないでください。

```powershell
ssh-keygen -t ed25519 -C "github-actions-subsclist-deploy" -f .\subsclist_deploy -N ""
```

作成されるファイル:

- `subsclist_deploy`: GitHub Secret に登録する秘密鍵
- `subsclist_deploy.pub`: 本番サーバーの `authorized_keys` に登録する公開鍵

## 本番サーバーへ公開鍵を登録

本番サーバーにログインし、公開鍵の中身を `authorized_keys` に追加します。

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
printf '%s\n' 'ssh-ed25519 ここに subsclist_deploy.pub の中身 github-actions-subsclist-deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## known_hosts の作成

GitHub Actionsから接続するサーバーが本物か確認するため、`PRODUCTION_SSH_KNOWN_HOSTS` を登録します。

まず本番サーバー上でホスト鍵のfingerprintを確認します。

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

次にローカルPCから取得したfingerprintと一致するか確認します。

```powershell
ssh-keyscan -t ed25519 subsclist.shinji.work > .\known_hosts_subsclist
ssh-keygen -lf .\known_hosts_subsclist
```

一致したら、`known_hosts_subsclist` の中身を GitHub Secret `PRODUCTION_SSH_KNOWN_HOSTS` に登録します。

## GitHub Secrets

`production` environment secrets に以下を登録してください。

| Secret名 | 内容 |
|---|---|
| `PRODUCTION_SSH_HOST` | 本番サーバーのホスト名。例: `subsclist.shinji.work` |
| `PRODUCTION_SSH_PORT` | SSHポート。通常は `22` |
| `PRODUCTION_SSH_USER` | SSHユーザー。例: `ubuntu` |
| `PRODUCTION_SSH_PRIVATE_KEY` | `subsclist_deploy` の中身 |
| `PRODUCTION_SSH_KNOWN_HOSTS` | `known_hosts_subsclist` の中身 |
| `PRODUCTION_APP_DIR` | サーバー上のアプリ配置先。例: `/var/www/subsclist` |
| `PRODUCTION_PM2_NAME` | PM2プロセス名。通常は `subsclist` |

## 本番サーバー側の前提

本番サーバーでは、事前に以下が必要です。

```bash
node -v
npm -v
pm2 -v
git --version
mysql --version
```

アプリディレクトリはGit管理されている必要があります。

```bash
cd /var/www/subsclist
git remote -v
git branch --show-current
```

本番 `.env` はサーバー上だけに置いてください。GitHub Secretsへ本番のDBパスワード、Stripe secret key、SMTP passwordを入れる必要はありません。

## 手動デプロイ方法

1. GitHubの `Actions` を開く。
2. `Deploy production` を選択する。
3. `Run workflow` を押す。
4. `ref` は通常 `master` を選ぶ。
5. DB migrationを実行する場合は `run_database_migrations` を `true` にする。
6. `production` environment の承認を行う。
7. workflowが成功したら `https://subsclist.shinji.work` を確認する。

## 本番で問題が出た場合の確認コマンド

```bash
cd /var/www/subsclist
pm2 status
pm2 logs subsclist --lines 100 --nostream
curl -I http://127.0.0.1:3000
sudo tail -n 100 /var/log/apache2/subsclist_error.log
```

Apacheが503を返す場合は、まず `curl -I http://127.0.0.1:3000` が成功するか確認します。失敗する場合はNext.js/PM2側、成功する場合はApache reverse proxy側を確認します。

## 自動デプロイへ進む条件

以下が安定してから、`master` push時の自動デプロイを検討してください。

- CIが3回以上連続で成功する。
- 手動CDが3回以上連続で成功する。
- migrationあり・なしの両方で運用手順が確認できている。
- PM2再起動後も `curl -I http://127.0.0.1:3000` が成功する。
- rollback手順が確認済み。