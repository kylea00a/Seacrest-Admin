#!/usr/bin/env bash
# If admin is down, remount RW if needed, ensure nginx, then restart app.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
PORT="${PORT:-3000}"
LOG="/var/log/seacrest-watchdog.log"

# Filesystem often flips to read-only after OOM/crash — nginx cannot write logs.
if ! touch /var/tmp/.seacrest-rw-check 2>/dev/null; then
  echo "$(date -Is) root read-only — remounting rw" >>"$LOG" 2>/dev/null || true
  mount -o remount,rw / 2>/dev/null || true
fi
rm -f /var/tmp/.seacrest-rw-check 2>/dev/null || true

if ! systemctl is-active --quiet nginx 2>/dev/null; then
  echo "$(date -Is) nginx down — starting" >>"$LOG" 2>/dev/null || true
  systemctl reset-failed nginx 2>/dev/null || true
  systemctl start nginx 2>/dev/null || true
fi

if curl -sf --max-time 8 "http://127.0.0.1:${PORT}/admin/login" >/dev/null 2>&1; then
  # App up; also probe via nginx if possible
  exit 0
fi
echo "$(date -Is) admin down — restarting" >>"$LOG" 2>/dev/null || true
bash "$APP_DIR/scripts/server-start.sh" >>"$LOG" 2>&1
