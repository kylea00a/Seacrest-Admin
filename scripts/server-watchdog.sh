#!/usr/bin/env bash
# Keep Seacrest Admin + nginx alive. Prefer systemd Restart=always; this is the backup.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/Seacrest-Admin}"
PORT="${PORT:-3000}"
LOG="/var/log/seacrest-watchdog.log"

log() { echo "$(date -Is) $*" >>"$LOG" 2>/dev/null || true; }

# Filesystem often flips to read-only after OOM/crash.
if ! touch /var/tmp/.seacrest-rw-check 2>/dev/null; then
  log "root read-only — remounting rw"
  mount -o remount,rw / 2>/dev/null || true
fi
rm -f /var/tmp/.seacrest-rw-check 2>/dev/null || true

# Never allow on-server rebuild sync (OOMs the 2GB droplet and wipes .next).
if systemctl is-enabled seacrest-admin-sync.timer >/dev/null 2>&1; then
  log "disabling seacrest-admin-sync.timer"
  systemctl stop seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true
  systemctl disable seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true
  systemctl mask seacrest-admin-sync.timer seacrest-admin-sync.service 2>/dev/null || true
fi

if ! systemctl is-active --quiet nginx 2>/dev/null; then
  log "nginx down — starting"
  systemctl reset-failed nginx 2>/dev/null || true
  systemctl start nginx 2>/dev/null || true
fi

if [[ ! -f "$APP_DIR/.next/BUILD_ID" ]]; then
  log "CRITICAL: .next/BUILD_ID missing — cannot start (need CI release tarball)"
  exit 2
fi

if curl -sf --max-time 8 "http://127.0.0.1:${PORT}/admin/login" >/dev/null 2>&1; then
  exit 0
fi

log "admin down — restarting"
if systemctl list-unit-files seacrest-admin.service >/dev/null 2>&1 && \
   systemctl cat seacrest-admin.service >/dev/null 2>&1; then
  systemctl reset-failed seacrest-admin.service 2>/dev/null || true
  systemctl restart seacrest-admin.service >>"$LOG" 2>&1 || \
    bash "$APP_DIR/scripts/server-start.sh" >>"$LOG" 2>&1
else
  bash "$APP_DIR/scripts/server-start.sh" >>"$LOG" 2>&1
fi
