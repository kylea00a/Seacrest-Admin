#!/usr/bin/env bash
# Remove perfcc malware persistence (run on droplet if 502 keeps returning).
set -euo pipefail

echo "=== Stop perfcc ==="
pkill -9 perfcc 2>/dev/null || true
rm -f \
  /root/.config/cron/perfcc \
  /root/.config/cron/perfclean \
  /bin/perfcc \
  /usr/bin/perfcc \
  /etc/cron.d/perfclean \
  /etc/cron.daily/perfclean \
  /etc/cron.hourly/perfclean

if crontab -l 2>/dev/null | grep -qE 'perfcc|perfclean'; then
  crontab -l 2>/dev/null | grep -vE 'perfcc|perfclean' | crontab -
  echo "Cleaned root crontab."
fi

if [ -f /root/.profile ] && grep -q perfcc /root/.profile; then
  sed -i '/perfcc/d' /root/.profile
  echo "Cleaned /root/.profile."
fi

grep -r perfcc /etc/cron* /root/.profile /var/spool/cron 2>/dev/null && echo "WARNING: perfcc references remain" || echo "No perfcc references found."

echo "=== Stop Cursor on production ==="
pkill -f '/root/.cursor-server' 2>/dev/null || true
pkill -f 'cursor-server' 2>/dev/null || true

echo "=== Memory ==="
free -h

echo "Done. Run: bash scripts/server-start.sh"
