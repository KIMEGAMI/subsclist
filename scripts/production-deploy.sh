#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-subsclist}"
APP_DIR="${APP_DIR:-/var/www/subsclist}"
BRANCH="${BRANCH:-codex/master-admin-deploy}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000}"

cd "$APP_DIR"

echo "[deploy] app=$APP_NAME dir=$APP_DIR branch=$BRANCH"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm install
npm run prisma:deploy
npm run seed:admin
npm run build

test -f .next/BUILD_ID

pm2 startOrReload ecosystem.config.cjs --only "$APP_NAME" --update-env
pm2 save

curl -fsSI "$HEALTHCHECK_URL" >/dev/null

echo "[deploy] completed"
