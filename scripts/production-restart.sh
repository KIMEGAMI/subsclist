#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/subsclist}"
APP_NAME="${APP_NAME:-subsclist}"
APP_PORT="${APP_PORT:-3000}"
BRANCH="${BRANCH:-master}"
HEALTH_PATH="${HEALTH_PATH:-/}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
SKIP_NPM_CI="${SKIP_NPM_CI:-0}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 was not found. Install it first."
}

wait_for_http() {
  local url="http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
  local attempt

  for attempt in $(seq 1 30); do
    if curl -fsS -I "$url" >/dev/null 2>&1; then
      log "Health check passed: $url"
      return 0
    fi
    sleep 2
  done

  pm2 logs "$APP_NAME" --lines 80 --nostream || true
  fail "Health check failed: $url"
}

need_command git
need_command npm
need_command pm2
need_command curl

[ -d "$APP_DIR" ] || fail "APP_DIR does not exist: $APP_DIR"
cd "$APP_DIR"
[ -f package.json ] || fail "package.json was not found in: $APP_DIR"
[ -f ecosystem.config.cjs ] || fail "ecosystem.config.cjs was not found. Pull the latest master first."

log "App directory: $(pwd)"
log "Branch: $BRANCH"
log "PM2 app: $APP_NAME / port: $APP_PORT"

if [ "$SKIP_GIT_PULL" != "1" ]; then
  current_branch="$(git branch --show-current)"
  [ "$current_branch" = "$BRANCH" ] || fail "Current branch is not $BRANCH: $current_branch"
  log "Updating from GitHub"
  git fetch origin "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  log "Skipping git pull"
fi

if [ "$SKIP_NPM_CI" != "1" ]; then
  log "Installing dependencies with npm ci"
  npm ci
else
  log "Skipping npm ci"
fi

log "Applying Prisma migrations"
npm run prisma:deploy

log "Building Next.js"
npm run build
[ -f .next/BUILD_ID ] || fail ".next/BUILD_ID is missing. Check the build logs."

if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  if command -v lsof >/dev/null 2>&1 && lsof -tiTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN || true
    fail "Port $APP_PORT is already used by a non-PM2 process. Stop it and run this script again."
  fi
fi

log "Starting or restarting the app with PM2"
APP_DIR="$APP_DIR" APP_NAME="$APP_NAME" APP_PORT="$APP_PORT" pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
wait_for_http

log "Current PM2 status"
pm2 status "$APP_NAME"
log "Done"