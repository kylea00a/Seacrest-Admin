#!/usr/bin/env bash
# Install 3-minute health watchdog + @reboot start on the droplet.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
MARKER="seacrest-admin-watchdog"
LINE="*/3 * * * * bash $APP_DIR/scripts/server-watchdog.sh"
BOOT="@reboot sleep 30 && bash $APP_DIR/scripts/server-start.sh >>/var/log/seacrest-boot.log 2>&1"
(
  crontab -l 2>/dev/null | grep -v "$MARKER" | grep -v 'server-watchdog.sh' | grep -v 'server-start.sh' | grep -v perfcc | grep -v perfclean || true
  echo "$LINE # $MARKER"
  echo "$BOOT"
  crontab -l 2>/dev/null | grep 'seacrest-telegram-calendar-due' || true
) | sort -u | crontab -
echo "Watchdog installed (every 3 min + @reboot)."
