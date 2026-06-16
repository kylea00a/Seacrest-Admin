#!/usr/bin/env bash
# Production deploy on the 2GB droplet. Ensures extra swap before npm ci/build.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
cd "$APP_DIR"

ensure_swap() {
  if ! swapon --show | grep -q '/swapfile2'; then
    if [ ! -f /swapfile2 ]; then
      fallocate -l 4G /swapfile2
      chmod 600 /swapfile2
      mkswap /swapfile2
    fi
    swapon /swapfile2 2>/dev/null || true
  fi
}

ensure_swap

git pull origin main
npm ci
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1400}" npm run build
pm2 reload ecosystem.config.cjs --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save
curl -sf http://127.0.0.1:3000/admin/login >/dev/null
curl -sf -o /dev/null -w '' http://127.0.0.1:3000/api/admin/auth/session || true
