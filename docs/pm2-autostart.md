# PM2 Autostart and Restart

This document explains how to run SubscList on the production server and keep it running after an OS reboot.

Production defaults:

```bash
APP_DIR=/var/www/subsclist
APP_NAME=subsclist
APP_PORT=3001
BRANCH=master
```

## First Setup

Run these commands on the production server.

```bash
cd /var/www/subsclist
git checkout master
git pull --ff-only origin master
chmod +x scripts/production-restart.sh scripts/install-pm2-autostart.sh
PRODUCTION_BACKUP_VERIFIED=1 ./scripts/production-restart.sh
./scripts/install-pm2-autostart.sh
```

Before running the restart script, confirm that a restorable database backup exists and has been verified. Set `PRODUCTION_BACKUP_VERIFIED=1` only after that check. If pending migrations require maintenance mode, enable it from the admin page before deployment; the read-only preflight blocks unsafe migration states.

`install-pm2-autostart.sh` registers the PM2 systemd service for the current user. Production runs this service as `deploy-subsclist` (`pm2-deploy-subsclist`). If sudo asks for a password, enter the server user's password.

## Reboot Test

```bash
sudo reboot
```

After reconnecting to the server, verify the service.

```bash
cd /var/www/subsclist
pm2 status subsclist
curl -I http://127.0.0.1:3001
curl -I https://subsclist.kimegami.jp
```

If `http://127.0.0.1:3001` returns `200` or `30x`, Next.js is running behind Apache.

## Normal Redeploy

```bash
cd /var/www/subsclist
PRODUCTION_BACKUP_VERIFIED=1 ./scripts/production-restart.sh
```

The restart script requires the backup confirmation and runs these steps:

- `git pull --ff-only origin master`
- `npm ci`
- `npm run prisma:generate`
- read-only production migration preflight
- `npm run build`
- `npm run prisma:deploy` only after preflight and build succeed
- `npm prune --omit=dev`
- checks `.next/BUILD_ID`
- `pm2 startOrRestart ecosystem.config.cjs --update-env`
- `pm2 save`
- local HTTP health check with `curl`

## Custom Values

Pass environment variables before the command when needed.

```bash
APP_PORT=3001 BRANCH=master PRODUCTION_BACKUP_VERIFIED=1 ./scripts/production-restart.sh
```

To skip Git pull or dependency install during emergency checks:

```bash
SKIP_GIT_PULL=1 SKIP_NPM_CI=1 PRODUCTION_BACKUP_VERIFIED=1 ./scripts/production-restart.sh
```

## 503 Checklist

Apache `Service Unavailable` usually means that Next.js is not responding on `127.0.0.1:3001`. Check these commands.

```bash
pm2 status subsclist
pm2 logs subsclist --lines 100 --nostream
ls -la .next/BUILD_ID
curl -I http://127.0.0.1:3001
sudo tail -n 100 /var/log/apache2/subsclist_error.log
```

If `.next/BUILD_ID` is missing, the production build did not complete. Run `PRODUCTION_BACKUP_VERIFIED=1 ./scripts/production-restart.sh` again and check the build log.
