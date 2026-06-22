#!/usr/bin/env bash
# Apply a CI-built release tarball on the droplet (no npm build on server).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
cd "$APP_DIR"

RELEASE="${1:-release.tar.gz}"
if [ ! -f "$RELEASE" ]; then
  echo "Missing $RELEASE — run deploy from GitHub Actions." >&2
  exit 1
fi

echo "Extracting $RELEASE (code only; data/admin untouched)…"
tar xzf "$RELEASE"
rm -f "$RELEASE"

pm2 reload ecosystem.config.cjs --update-env 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save

curl -sf http://127.0.0.1:3000/admin/login >/dev/null
echo "Release applied; admin login OK."
