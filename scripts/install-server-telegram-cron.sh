#!/usr/bin/env bash
# Installed automatically on deploy — system cron backup for Telegram schedules.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
PORT="${PORT:-3000}"
MARKER="seacrest-telegram-calendar-due"
cd "$APP_DIR"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

SECRET="${TELEGRAM_CRON_SECRET:-}"
if [ -n "$SECRET" ]; then
  CRON_CMD="cd ${APP_DIR} && set -a && [ -f .env.local ] && . ./.env.local; set +a && curl -fsS -m 120 -H \"Authorization: Bearer ${SECRET}\" \"http://127.0.0.1:${PORT}/api/admin/telegram/calendar-due?source=system-cron\" >/dev/null 2>&1 # ${MARKER}"
else
  CRON_CMD="cd ${APP_DIR} && set -a && [ -f .env.local ] && . ./.env.local; set +a && curl -fsS -m 120 \"http://127.0.0.1:${PORT}/api/admin/telegram/calendar-due?source=system-cron\" >/dev/null 2>&1 # ${MARKER}"
fi

(
  crontab -l 2>/dev/null | grep -v "$MARKER" || true
  echo "*/5 * * * * ${CRON_CMD}"
) | crontab -

echo "Telegram system cron installed (${MARKER}, port ${PORT})."
