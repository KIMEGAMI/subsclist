#!/usr/bin/env bash
set -Eeuo pipefail

PM2_USER="${PM2_USER:-$(id -un)}"
DEFAULT_PM2_HOME_DIR="$(getent passwd "$PM2_USER" | cut -d: -f6)"
[ -n "$DEFAULT_PM2_HOME_DIR" ] || {
  printf 'ERROR: PM2 user was not found: %s\n' "$PM2_USER" >&2
  exit 1
}
PM2_HOME_DIR="${PM2_HOME_DIR:-$DEFAULT_PM2_HOME_DIR}"
APP_NAME="${APP_NAME:-subsclist}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

command -v pm2 >/dev/null 2>&1 || fail "pm2 was not found. Run: sudo npm install -g pm2"
command -v systemctl >/dev/null 2>&1 || fail "systemctl was not found. Run this on a systemd server."

log "Saving the current PM2 process list"
pm2 save

log "Registering PM2 startup service: user=$PM2_USER home=$PM2_HOME_DIR"
if [ "$(id -u)" -eq 0 ]; then
  env PATH="$PATH" pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME_DIR"
else
  sudo env PATH="$PATH" pm2 startup systemd -u "$PM2_USER" --hp "$PM2_HOME_DIR"
fi

log "Checking systemd registration"
systemctl is-enabled "pm2-${PM2_USER}" || true
systemctl status "pm2-${PM2_USER}" --no-pager || true

log "Verification commands"
printf 'pm2 status %s\n' "$APP_NAME"
printf 'curl -I http://127.0.0.1:%s\n' "${APP_PORT:-3000}"
