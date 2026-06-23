#!/usr/bin/env bash
# Start or restart Seacrest Admin on port 3000 (setsid; skip hung pm2 on 2GB droplet).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
cd "$APP_DIR"
PORT="${PORT:-3000}"
LOG="${LOG:-/var/log/seacrest-next.log}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"

fuser -k "${PORT}/tcp" 2>/dev/null || true
setsid env NODE_OPTIONS="$NODE_OPTIONS" node node_modules/next/dist/bin/next start -p "$PORT" </dev/null >>"$LOG" 2>&1 &
sleep 5
curl -sf "http://127.0.0.1:${PORT}/admin/login" >/dev/null
echo "Started (NODE_OPTIONS=$NODE_OPTIONS, log=$LOG)."
