# PM2 Autostart and Restart

This document explains how to run SubscList on the production server and keep it running after an OS reboot.

Production defaults:

```bash
APP_DIR=/var/www/subsclist
APP_NAME=subsclist
APP_PORT=3000
BRANCH=master
```

## First Setup

Run these commands on the production server.

```bash
cd /var/www/subsclist
git checkout master
git pull --ff-only origin master
chmod +x scripts/production-restart.sh scripts/install-pm2-autostart.sh
./scripts/production-restart.sh
./scripts/install-pm2-autostart.sh
```

`install-pm2-autostart.sh` registers the PM2 systemd service for the current user. On Ubuntu this is usually `pm2-ubuntu`. If sudo asks for a password, enter the Ubuntu user password.

## Reboot Test

```bash
sudo reboot
```

After reconnecting to the server, verify the service.

```bash
cd /var/www/subsclist
pm2 status subsclist
curl -I http://127.0.0.1:3000
curl -I https://subsclist.shinji.work
```

If `http://127.0.0.1:3000` returns `200` or `30x`, Next.js is running behind Apache.

## Normal Redeploy

```bash
cd /var/www/subsclist
./scripts/production-restart.sh
```

The restart script runs these steps:

- `git pull --ff-only origin master`
- `npm ci`
- `npm run prisma:deploy`
- `npm run build`
- checks `.next/BUILD_ID`
- `pm2 startOrRestart ecosystem.config.cjs --update-env`
- `pm2 save`
- local HTTP health check with `curl`

## Custom Values

Pass environment variables before the command when needed.

```bash
APP_PORT=3001 BRANCH=master ./scripts/production-restart.sh
```

To skip Git pull or dependency install during emergency checks:

```bash
SKIP_GIT_PULL=1 SKIP_NPM_CI=1 ./scripts/production-restart.sh
```

## 503 Checklist

Apache `Service Unavailable` usually means that Next.js is not responding on `127.0.0.1:3000`. Check these commands.

```bash
pm2 status subsclist
pm2 logs subsclist --lines 100 --nostream
ls -la .next/BUILD_ID
curl -I http://127.0.0.1:3000
sudo tail -n 100 /var/log/apache2/subsclist_error.log
```

If `.next/BUILD_ID` is missing, the production build did not complete. Run `./scripts/production-restart.sh` again and check the build log.