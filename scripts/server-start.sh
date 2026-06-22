#!/usr/bin/env bash
# Start or restart Seacrest Admin on port 3000 (pm2 with setsid fallback).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
cd "$APP_DIR"
PORT="${PORT:-3000}"
LOG="${LOG:-/var/log/seacrest-next.log}"

fuser -k "${PORT}/tcp" 2>/dev/null || true

if command -v pm2 >/dev/null; then
  if timeout 45 pm2 reload ecosystem.config.cjs --update-env 2>/dev/null; then
    pm2 save 2>/dev/null || true
    curl -sf "http://127.0.0.1:${PORT}/admin/login" >/dev/null
    echo "Started via pm2 reload."
    exit 0
  fi
  if timeout 45 pm2 start ecosystem.config.cjs 2>/dev/null; then
    pm2 save 2>/dev/null || true
    curl -sf "http://127.0.0.1:${PORT}/admin/login" >/dev/null
    echo "Started via pm2 start."
    exit 0
  fi
fi

setsid node node_modules/next/dist/bin/next start -p "$PORT" </dev/null >>"$LOG" 2>&1 &
sleep 4
curl -sf "http://127.0.0.1:${PORT}/admin/login" >/dev/null
echo "Started via setsid (see $LOG)."
