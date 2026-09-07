# 通知メールの自動実行

SubscListの通知は、更新日・無料トライアル終了日・解約期限に加え、利用頻度を設定済みで7日間利用記録も見直しもない契約を対象に送信します。Premiumでは毎月1日に、前月の支払い実績、仕事利用分、更新判断、解約完了、月次締めの状況と、今月の月額見込み・予算差をまとめた月次運用サマリーも送信します。全契約を解約済みでも前月の成果を確認できるよう、月次サマリーは契約の有無ではなく利用者の設定を基準に送信します。利用者は契約ごとの通知と月次サマリーを設定画面から停止・再開できます。

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

## 4. 管理画面で実行状態を確認

管理者でログインし、管理画面の「通知ジョブ」欄を確認します。最後の自動実行日時、送信・スキップ・失敗件数と、次の状態が表示されます。

- `正常`: 直近3時間以内に自動実行が成功
- `一部失敗`: 自動実行は完了したが送信失敗あり
- `実行中`: ジョブが処理中
- `停止の可能性`: 最後の開始から3時間超、または成功記録が3時間超
- `未実行`: 実行履歴がまだない

手動の「今すぐ通知を確認」は全体ジョブの稼働確認には含めません。cronを設定したあとに手動疎通を行い、次回の毎時実行後も管理画面の状態が更新されることを確認してください。

## 失敗時の確認

```bash
cd /var/www/subsclist
pm2 status subsclist
curl -I http://127.0.0.1:3000
APP_DIR=/var/www/subsclist APP_PORT=3000 ./scripts/run-notifications.sh
```

`NOTIFICATION_JOB_SECRET is missing` は `.env` の設定漏れです。`Notification job request failed` は、Next.jsが起動していない、ポートが異なる、または認証に失敗している可能性があります。管理画面が「一部失敗」の場合はメール設定と送信先を確認し、「停止の可能性」の場合はcrontab、アプリの稼働状態、ポートを順に確認してください。シークレットの値自体はログやチャットに貼り付けないでください。
