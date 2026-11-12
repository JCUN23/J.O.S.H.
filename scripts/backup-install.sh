#!/usr/bin/env bash
# Run scripts/backup-pi.sh every night at 3:15 on this Mac (launchd). If the Mac is
# asleep then, launchd runs it at the next wake. Needs passwordless ssh to the Pi
# (the same key `npm run deploy` uses). Remove: bash scripts/backup-install.sh --remove
set -euo pipefail

LABEL=com.sentinel.backup
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$HOME/sentinel-backups"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then rm -f "$PLIST"; echo "nightly backup removed"; exit 0; fi

mkdir -p "$(dirname "$PLIST")" "$LOGDIR"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$ROOT/scripts/backup-pi.sh</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>15</integer></dict>
  <key>StandardOutPath</key><string>$LOGDIR/backup.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/backup.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "nightly backup installed (3:15 AM). Running one now to check it works..."
bash "$ROOT/scripts/backup-pi.sh"
