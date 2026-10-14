#!/usr/bin/env bash
set -Eeuo pipefail

# Kept for existing deployments; this job synchronizes prices only, not news.

APP_DIR="${APP_DIR:-/var/www/subsclist}"
APP_PORT="${APP_PORT:-3000}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"
PRICE_JOB_TIMEOUT_SECONDS="${PRICE_JOB_TIMEOUT_SECONDS:-180}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl was not found."
[ -r "$ENV_FILE" ] || fail "Environment file is not readable: $ENV_FILE"

secret_line="$(grep -m1 -E '^NEWS_JOB_SECRET=' "$ENV_FILE" || true)"
[ -n "$secret_line" ] || fail "NEWS_JOB_SECRET is missing from the environment file."

news_secret="${secret_line#*=}"
case "$news_secret" in
  \"*) news_secret="${news_secret#\"}"; news_secret="${news_secret%\"}" ;;
  \'*) news_secret="${news_secret#\'}"; news_secret="${news_secret%\'}" ;;
esac
[ -n "$news_secret" ] || fail "NEWS_JOB_SECRET is empty."
case "$news_secret" in
  *$'\n'*|*$'\r'*) fail "NEWS_JOB_SECRET contains an invalid newline." ;;
esac

curl_config="$(mktemp)"
chmod 600 "$curl_config"
trap 'rm -f "$curl_config"' EXIT
escaped_secret="${news_secret//\\/\\\\}"
escaped_secret="${escaped_secret//\"/\\\"}"
printf 'header = "Authorization: Bearer %s"\n' "$escaped_secret" > "$curl_config"

if ! curl --fail --silent --show-error --max-time "$PRICE_JOB_TIMEOUT_SECONDS" --retry 1 --retry-delay 10 \
  --config "$curl_config" \
  --request POST \
  --header "Accept: application/json" \
  --output /dev/null \
  "http://127.0.0.1:${APP_PORT}/api/admin/prices/sync"; then
  fail "Daily official price sync failed."
fi

printf 'Daily official price sync completed successfully.\n'
