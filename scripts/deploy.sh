#!/usr/bin/env bash
# Build on the Mac, ship to the Pi, install prod deps there, restart, health-check.
# Usage:  npm run deploy            (uses the `sentinel-pi` alias from ~/.ssh/config)
#         SENTINEL_HOST=jcun@10.0.0.77 npm run deploy
set -euo pipefail

# Default: the ~/.ssh/config alias from docs/pi-setup.md (it carries the Pi username).
# A bare hostname would log in with the Mac's username instead.
HOST="${SENTINEL_HOST:-sentinel-pi}"
APP_DIR=/opt/sentinel
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Two Sentinels on one tailnet = every rule, Game Day and alert fires twice.
if curl -fsS --max-time 2 localhost:3001/api/health >/dev/null 2>&1; then
  echo "!!  Sentinel is still running on this Mac (port 3001). Stop 'npm run panel' first," >&2
  echo "!!  or rules, Game Day and notifications will fire from both machines." >&2
  if [ "${FORCE_DEPLOY:-}" != "1" ]; then echo "    (FORCE_DEPLOY=1 to deploy anyway)" >&2; exit 1; fi
fi

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
# Pi mic listener; its venv lives on the Pi and is never synced.
rsync -az --delete --exclude .venv --exclude __pycache__ --exclude 'test_*.py' voice/ "$HOST:$APP_DIR/voice/"

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
echo "==> Secrets, logins and state (first deploy only)"
seed backend/.env "$APP_DIR/backend/.env"
# Logins (incl. Frame TV pairing), faces, rules you enabled + what fired today, scenes,
# Game Day's already-triggered games, the activity log. Not heartbeat.json: the Pi
# starts its own uptime record.
for f in tokens faces rules scenes gameday activity; do
  seed "backend/data/$f.json" "$APP_DIR/backend/data/$f.json"
done

echo "==> Installing prod deps + Pi mic listener on Pi, restarting"
# The voice install runs first: it may add VOICE_TOKEN to .env, which the restart picks up.
# SKIP_VOICE=1 to leave the Pi mic alone.
VOICE_STEP="bash $APP_DIR/scripts/voice-install.sh &&"
[ "${SKIP_VOICE:-}" = "1" ] && VOICE_STEP=""
ssh -t "$HOST" "cd $APP_DIR/backend && npm ci --omit=dev --no-audit --no-fund && $VOICE_STEP sudo systemctl restart sentinel"

echo "==> Health check"
if ssh "$HOST" 'for i in $(seq 1 20); do curl -fsS localhost:3001/api/health >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'; then
  echo "Sentinel is up."
else
  echo "Health check failed. Logs:  ssh $HOST journalctl -u sentinel -n 50 --no-pager" >&2
  exit 1
fi
