#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/subsclist}"
APP_NAME="${APP_NAME:-subsclist}"
APP_PORT="${APP_PORT:-3000}"
BRANCH="${BRANCH:-master}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
HEALTH_PATH="${HEALTH_PATH:-/api/system/status}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-0}"
SKIP_NPM_CI="${SKIP_NPM_CI:-0}"
PRODUCTION_BACKUP_VERIFIED="${PRODUCTION_BACKUP_VERIFIED:-0}"

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
  local url="$1"
  local attempt

  for attempt in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "Health check passed: $url"
      return 0
    fi
    sleep 2
  done

  pm2 logs "$APP_NAME" --lines 80 --nostream || true
  fail "Health check failed: $url"
}

need_command git
need_command node
need_command npm
need_command pm2
need_command curl
need_command ss

[ -d "$APP_DIR" ] || fail "APP_DIR does not exist: $APP_DIR"
cd "$APP_DIR"
[ -f package.json ] || fail "package.json was not found in: $APP_DIR"
[ -f ecosystem.config.cjs ] || fail "ecosystem.config.cjs was not found in the release checkout."
[ "$PRODUCTION_BACKUP_VERIFIED" = "1" ] || fail "Verify a restorable production database backup, then set PRODUCTION_BACKUP_VERIFIED=1."
[[ "$BRANCH" == "master" || "$BRANCH" == "main" ]] || fail "BRANCH must be master or main."
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "Set DEPLOY_SHA to the exact, previously verified 40-character commit SHA."
[[ "$APP_PORT" =~ ^[0-9]{1,5}$ ]] && (( APP_PORT >= 1 && APP_PORT <= 65535 )) || fail "APP_PORT must be a valid TCP port."

# Refuse before changing the checkout, dependencies, or database if another
# process owns the application port and this PM2 user cannot manage the app.
if ! pm2 describe "$APP_NAME" >/dev/null 2>&1 && ss -H -ltn "sport = :${APP_PORT}" | grep -q .; then
  ss -ltnp "sport = :${APP_PORT}" || true
  fail "Port $APP_PORT is already listening, but PM2 does not know $APP_NAME. Resolve the process owner before deployment."
fi

if [ -n "$(git status --porcelain)" ]; then
  fail "Application worktree is dirty; refusing deployment."
fi

log "App directory: $(pwd)"
log "Branch: $BRANCH"
log "PM2 app: $APP_NAME / port: $APP_PORT"

if [ "$SKIP_GIT_PULL" != "1" ]; then
  log "Fetching the approved release ref"
  git fetch origin "$BRANCH:refs/remotes/origin/$BRANCH"
  git cat-file -e "$DEPLOY_SHA^{commit}" || fail "DEPLOY_SHA is not available locally."
  git merge-base --is-ancestor "$DEPLOY_SHA" "origin/$BRANCH" || fail "DEPLOY_SHA is not reachable from origin/$BRANCH."
  git checkout --detach "$DEPLOY_SHA"
else
  [ "$(git rev-parse HEAD)" = "$DEPLOY_SHA" ] || fail "Current HEAD does not match DEPLOY_SHA."
  log "Using the exact verified local commit"
fi

[ "$(git rev-parse HEAD)" = "$DEPLOY_SHA" ] || fail "Checked-out commit does not match DEPLOY_SHA."
[ -z "$(git status --porcelain)" ] || fail "Release checkout is not clean after selecting DEPLOY_SHA."
log "Deploying verified commit $DEPLOY_SHA"

log "Checking Node.js compatibility with locked Prisma"
node scripts/check-node-version.cjs

if [ "$SKIP_NPM_CI" != "1" ]; then
  log "Installing dependencies with npm ci"
  npm ci --ignore-scripts
else
  log "Skipping npm ci"
fi

log "Generating Prisma Client"
npm run prisma:generate

log "Checking production migration and maintenance safety"
PRODUCTION_MIGRATION_PREFLIGHT=1 node --env-file=.env scripts/preflight-production-migrations.cjs

log "Building Next.js"
npm run build
[ -f .next/BUILD_ID ] || fail ".next/BUILD_ID is missing. Check the build logs."

log "Applying Prisma migrations after successful build and preflight"
npm run prisma:deploy

log "Removing development dependencies"
npm prune --omit=dev

log "Starting or restarting the app with PM2"
APP_DIR="$APP_DIR" APP_NAME="$APP_NAME" APP_PORT="$APP_PORT" pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
wait_for_http "http://127.0.0.1:${APP_PORT}${HEALTH_PATH}"
public_origin="$(node --env-file=.env -e 'const value=process.env.APP_URL||process.env.NEXTAUTH_URL;if(!value)process.exit(1);const url=new URL(value);if(url.protocol!=="https:")process.exit(1);process.stdout.write(url.origin)')"
wait_for_http "${public_origin}${HEALTH_PATH}"

log "Current PM2 status"
pm2 status "$APP_NAME"
log "Done"
