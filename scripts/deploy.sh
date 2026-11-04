#!/usr/bin/env bash
# Build on the Mac, ship to the Pi, install prod deps there, restart, health-check.
# Usage:  npm run deploy            (defaults below)
#         SENTINEL_HOST=pi@sentinel-pi.local npm run deploy
set -euo pipefail

HOST="${SENTINEL_HOST:-sentinel-pi.local}"   # anything ssh accepts: user@host, an ~/.ssh/config alias
APP_DIR=/opt/sentinel
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building frontend"
npm run build

echo "==> Syncing to $HOST:$APP_DIR"
# Never ship: Mac-native node_modules (sharp is per-platform), secrets, the
# Pi's own logins, or the unused macOS Piper bundle. --delete leaves excluded
# paths on the Pi alone, so its .env and data/ survive every deploy.
rsync -az --delete dist/ "$HOST:$APP_DIR/dist/"
rsync -az --delete \
  --exclude node_modules --exclude data --exclude piper \
  --exclude '.env' --exclude '.env.bak*' \
  backend/ "$HOST:$APP_DIR/backend/"
rsync -az deploy scripts "$HOST:$APP_DIR/"

# First deploy only: seed the Pi's .env and logins from this Mac. Later deploys
# never overwrite them (the Pi's copies are the source of truth from then on).
seed() {
  local src="$1" dest="$2"
  [ -f "$src" ] || return 0
  if ssh "$HOST" "test -f '$dest'"; then
    echo "    $dest exists on Pi; leaving it"
  else
    echo "    seeding $dest"
    ssh "$HOST" "mkdir -p \"\$(dirname '$dest')\""
    scp -q "$src" "$HOST:$dest"
    ssh "$HOST" "chmod 600 '$dest'"
  fi
}
echo "==> Secrets/logins (first deploy only)"
seed backend/.env "$APP_DIR/backend/.env"
seed backend/data/tokens.json "$APP_DIR/backend/data/tokens.json"

echo "==> Installing prod deps on Pi + restarting"
ssh -t "$HOST" "cd $APP_DIR/backend && npm ci --omit=dev --no-audit --no-fund && sudo systemctl restart sentinel"

echo "==> Health check"
if ssh "$HOST" 'for i in $(seq 1 20); do curl -fsS localhost:3001/api/health >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'; then
  echo "Sentinel is up."
else
  echo "Health check failed. Logs:  ssh $HOST journalctl -u sentinel -n 50 --no-pager" >&2
  exit 1
fi
