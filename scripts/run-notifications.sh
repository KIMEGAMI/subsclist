#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/subsclist}"
APP_PORT="${APP_PORT:-3000}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl was not found."
[ -r "$ENV_FILE" ] || fail "Environment file is not readable: $ENV_FILE"

secret_line="$(grep -m1 -E '^NOTIFICATION_JOB_SECRET=' "$ENV_FILE" || true)"
[ -n "$secret_line" ] || fail "NOTIFICATION_JOB_SECRET is missing from the environment file."

notification_secret="${secret_line#*=}"
case "$notification_secret" in
  \"*) notification_secret="${notification_secret#\"}"; notification_secret="${notification_secret%\"}" ;;
  \'*) notification_secret="${notification_secret#\'}"; notification_secret="${notification_secret%\'}" ;;
esac

[ -n "$notification_secret" ] || fail "NOTIFICATION_JOB_SECRET is empty."
case "$notification_secret" in
  *$'\n'*|*$'\r'*) fail "NOTIFICATION_JOB_SECRET contains an invalid newline." ;;
esac

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

if ! curl --fail --silent --show-error --max-time 60 --retry 2 --retry-delay 5 \
  --request POST \
  --header "Authorization: Bearer ${notification_secret}" \
  --header "Accept: application/json" \
  --output "$response_file" \
  "http://127.0.0.1:${APP_PORT}/api/notifications/send"; then
  fail "Notification job request failed."
fi

printf 'Notification job completed successfully.\n'
