#!/usr/bin/env bash
# Pi housekeeping for running 24/7, applied on every deploy (idempotent).
#   - Cap the system journal: logs otherwise grow on the SD card forever, eating space
#     and wearing the card. 200 MB is weeks of Sentinel logs.
set -euo pipefail

CONF=/etc/systemd/journald.conf.d/sentinel.conf
WANT=$'[Journal]\nSystemMaxUse=200M\nMaxRetentionSec=1month'
if [ "$(sudo cat "$CONF" 2>/dev/null)" != "$WANT" ]; then
  sudo mkdir -p "$(dirname "$CONF")"
  printf '%s\n' "$WANT" | sudo tee "$CONF" >/dev/null
  sudo systemctl restart systemd-journald
  echo "    journal capped at 200 MB / 1 month"
fi
