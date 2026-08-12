# 通知メールの自動実行

SubscListの通知は、更新日・無料トライアル終了日・解約期限に加え、利用頻度を設定済みで7日間利用記録も見直しもない契約を対象に送信します。

通知APIはジョブ用シークレットを必須にしています。シークレットをソースコード、Git、crontabのコマンド行へ書かないでください。

## 1. `.env` にジョブ用シークレットを設定

本番サーバーで実行します。既存値を上書きする前に、現在の設定を確認してください。

```bash
cd /var/www/subsclist
openssl rand -hex 32
nano .env
```

生成された値を次の形式で `.env` に設定します。

```dotenv
NOTIFICATION_JOB_SECRET="生成したランダムな値"
```

`.env` は本番サーバーだけに置き、権限を制限します。

```bash
chmod 600 /var/www/subsclist/.env
```

## 2. 手動で疎通確認

デプロイ後に一度だけ実行します。メール本文やシークレットは標準出力へ出ません。

```bash
cd /var/www/subsclist
chmod 750 scripts/run-notifications.sh
APP_DIR=/var/www/subsclist APP_PORT=3000 ./scripts/run-notifications.sh
```

`Notification job completed successfully.` と表示されれば、Next.jsへの接続とシークレット認証は成功しています。対象通知がなければメールは送られません。

## 3. 毎時実行するcronを登録

ログ保存先を作成してから、現在のログインユーザーのcrontabを編集します。

```bash
mkdir -p /var/www/subsclist/logs
chmod 750 /var/www/subsclist/logs
crontab -e
```

次の2行を追加します。ジョブは毎時0分に実行され、各ユーザーが設定画面で選んだ「通知時刻」（未設定時は9時）にだけメールを送ります。`ubuntu` 以外のユーザーで動かしている場合も、そのPM2実行ユーザーのcrontabへ設定してください。

```cron
CRON_TZ=Asia/Tokyo
0 * * * * APP_DIR=/var/www/subsclist APP_PORT=3000 /var/www/subsclist/scripts/run-notifications.sh >> /var/www/subsclist/logs/notifications-cron.log 2>&1
```

登録内容は次で確認できます。

```bash
crontab -l
tail -n 50 /var/www/subsclist/logs/notifications-cron.log
```

## 失敗時の確認

```bash
cd /var/www/subsclist
pm2 status subsclist
curl -I http://127.0.0.1:3000
APP_DIR=/var/www/subsclist APP_PORT=3000 ./scripts/run-notifications.sh
```

`NOTIFICATION_JOB_SECRET is missing` は `.env` の設定漏れです。`Notification job request failed` は、Next.jsが起動していない、ポートが異なる、または認証に失敗している可能性があります。シークレットの値自体はログやチャットに貼り付けないでください。
