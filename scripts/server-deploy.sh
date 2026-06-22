#!/usr/bin/env bash
# Deprecated: production deploy runs on GitHub Actions (see .github/workflows/deploy.yml).
# Manual fallback only if you have a CI-built release.tar.gz:
#   bash scripts/server-apply-release.sh release.tar.gz
set -euo pipefail
echo "Server-side npm build is disabled (2GB droplet). Use GitHub Actions deploy." >&2
echo "Manual: bash scripts/server-apply-release.sh release.tar.gz" >&2
exit 1
