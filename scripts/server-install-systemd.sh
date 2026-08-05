#!/usr/bin/env bash
# Install systemd unit for Seacrest Admin + disable dangerous on-server sync.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
UNIT_SRC="$APP_DIR/scripts/seacrest-admin.service"

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "Missing $UNIT_SRC" >&2
  exit 1
fi

# Never rebuild on this 2GB droplet — CI deploys the tarball instead.
systemctl stop seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true
systemctl disable seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true
systemctl mask seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true

cp "$UNIT_SRC" /etc/systemd/system/seacrest-admin.service
systemctl daemon-reload
systemctl enable seacrest-admin.service

# Prefer systemd over ad-hoc setsid when available
if [[ -f "$APP_DIR/.next/BUILD_ID" ]]; then
  fuser -k 3000/tcp 2>/dev/null || true
  sleep 1
  systemctl restart seacrest-admin.service
  sleep 3
  systemctl is-active seacrest-admin.service
  curl -sf --max-time 15 http://127.0.0.1:3000/admin/login >/dev/null
  echo "seacrest-admin.service installed and running."
else
  echo "WARN: .next/BUILD_ID missing — deploy a CI release before starting." >&2
  exit 2
fi
