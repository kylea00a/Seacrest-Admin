#!/usr/bin/env bash
# One-time / manual server hygiene for the 2GB production droplet.
set -euo pipefail

echo "=== Remove suspicious perfcc cron ==="
if crontab -l 2>/dev/null | grep -q perfcc; then
  crontab -l 2>/dev/null | grep -v perfcc | crontab -
  echo "Removed perfcc from root crontab."
else
  echo "No perfcc in crontab."
fi
rm -f /root/.config/cron/perfcc /root/.config/cron/perfclean /etc/cron.d/perfclean
if [ -f /root/.profile ] && grep -q perfcc /root/.profile; then
  sed -i '/perfcc/d' /root/.profile
  echo "Removed perfcc from /root/.profile."
fi

echo "=== Stop Cursor remote server on production (frees RAM) ==="
pkill -f '/root/.cursor-server' 2>/dev/null || true
pkill -f 'cursor-server' 2>/dev/null || true
echo "Cursor server processes stopped. Do not use Remote SSH on this droplet."

echo "=== PM2 status ==="
pm2 list || true

echo "=== Memory ==="
free -h

echo "Done."
