#!/usr/bin/env bash
# Back up the Pi's irreplaceable state to this Mac: backend/.env (secrets) and
# backend/data/ (logins, rules, scenes, Alfred's memory, Frame TV pairing, faces...).
# The code is in git; this is everything that isn't. Keeps the newest 14.
#   npm run backup                          (by hand)
#   bash scripts/backup-install.sh          (every night at 3:15, via launchd)
# Restore:  ssh sentinel-pi 'tar -xzf - -C /opt/sentinel/backend' < sentinel-YYYY-MM-DD-HHMM.tgz
#           then: ssh sentinel-pi sudo systemctl restart sentinel
set -euo pipefail

HOST="${SENTINEL_HOST:-sentinel-pi}"
DEST="${SENTINEL_BACKUP_DIR:-$HOME/sentinel-backups}"   # NOT in the repo: .env has secrets
KEEP="${SENTINEL_BACKUP_KEEP:-14}"

mkdir -p "$DEST"
chmod 700 "$DEST"
out="$DEST/sentinel-$(date +%Y-%m-%d-%H%M).tgz"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT          # never leave a half-written archive behind
ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" 'tar -czf - -C /opt/sentinel/backend .env data' > "$tmp"
# A tiny file means something went wrong on the way (empty data dir, ssh refused)
if [ "$(wc -c < "$tmp")" -lt 200 ]; then rm -f "$tmp"; echo "backup failed: archive too small" >&2; exit 1; fi
mv "$tmp" "$out"
chmod 600 "$out"
echo "backed up to $out ($(du -h "$out" | cut -f1))"

# Keep the newest $KEEP
ls -1t "$DEST"/sentinel-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; done
