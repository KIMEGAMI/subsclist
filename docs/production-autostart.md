# 本番サーバ自動起動手順

この手順は Ubuntu 本番サーバ `/var/www/subsclist` で実行します。
Apache は `127.0.0.1:3000` にリバースプロキシし、Next.js は PM2 で常駐させます。

## 初回または修正反映時

```bash
cd /var/www/subsclist
git fetch origin
git checkout codex/master-admin-deploy
git pull --ff-only origin codex/master-admin-deploy

bash scripts/production-deploy.sh
```

## OS再起動後も自動起動させる設定

PM2 の systemd 自動起動を一度だけ登録します。

```bash
pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

上のコマンドを実行すると、`sudo env PATH=... pm2 startup ...` のようなコマンドが表示されます。
表示された `sudo` コマンドをそのまま実行してください。

その後、現在のプロセス一覧を保存します。

```bash
cd /var/www/subsclist
pm2 startOrReload ecosystem.config.cjs --only subsclist --update-env
pm2 save
```

## 再起動テスト

```bash
sudo reboot
```

再ログイン後に確認します。

```bash
pm2 status
curl -I http://127.0.0.1:3000
curl -I https://subsclist.shinji.work
```

`127.0.0.1:3000` が応答しない場合、Apache ではなく Next.js/PM2 側が起動していません。
その場合は次を確認します。

```bash
cd /var/www/subsclist
ls -la .next/BUILD_ID
pm2 logs subsclist --lines 100 --nostream
```

`.next/BUILD_ID` が無い場合は、ビルドが完了していません。

```bash
cd /var/www/subsclist
bash scripts/production-deploy.sh
```
