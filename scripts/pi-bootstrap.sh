#!/usr/bin/env bash
# One-time Pi setup. Run ON THE PI (after scripts/deploy.sh has copied the repo
# to /opt/sentinel at least once, or clone it there):
#   bash /opt/sentinel/scripts/pi-bootstrap.sh
set -euo pipefail

NODE_MAJOR=24
APP_DIR=/opt/sentinel
RUN_USER="${SUDO_USER:-$USER}"

echo "==> Packages"
sudo apt-get update -y
sudo apt-get install -y curl ca-certificates rsync

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  echo "==> Node.js $NODE_MAJOR (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version

echo "==> App dir $APP_DIR (owned by $RUN_USER)"
sudo mkdir -p "$APP_DIR/backend/data"
sudo chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
chmod 700 "$APP_DIR/backend/data"

echo "==> systemd service"
sed "s/__USER__/$RUN_USER/" "$APP_DIR/deploy/sentinel.service" | sudo tee /etc/systemd/system/sentinel.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable sentinel

if ! command -v tailscale >/dev/null; then
  echo "==> Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
fi

cat <<NEXT

Bootstrap done. Remaining manual steps (see docs/pi-setup.md):
  1. sudo tailscale up          # log in with the same account
  2. From the Mac:  npm run deploy   # installs deps + starts the service
  3. Hostname swap, then:  sudo tailscale serve --bg 3001
NEXT
