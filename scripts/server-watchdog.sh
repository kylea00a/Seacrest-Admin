#!/usr/bin/env bash
# If admin is down, restart it. Install via server-install-watchdog.sh on the droplet.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
PORT="${PORT:-3000}"
if curl -sf --max-time 8 "http://127.0.0.1:${PORT}/admin/login" >/dev/null 2>&1; then
  exit 0
fi
echo "$(date -Is) admin down — restarting" >>/var/log/seacrest-watchdog.log
bash "$APP_DIR/scripts/server-start.sh" >>/var/log/seacrest-watchdog.log 2>&1
