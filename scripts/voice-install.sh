#!/usr/bin/env bash
# Install or update the Pi mic listener (sentinel-voice). Runs ON the Pi; deploy.sh
# calls it on every deploy. Safe to re-run: each step skips itself when already done.
set -euo pipefail
APP=/opt/sentinel
V="$APP/voice"
ENV_FILE="$APP/backend/.env"
ME="$(id -un)"

need=()
for p in python3-venv libportaudio2 mpg123 alsa-utils; do dpkg -s "$p" >/dev/null 2>&1 || need+=("$p"); done
if ((${#need[@]})); then
  echo "    apt: installing ${need[*]}"
  sudo apt-get update -qq && sudo apt-get install -y -qq "${need[@]}"
fi
id -nG "$ME" | grep -qw audio || sudo usermod -aG audio "$ME"

[ -x "$V/.venv/bin/python" ] || { echo "    creating Python venv"; python3 -m venv "$V/.venv"; }
stamp="$V/.venv/.requirements"
if ! cmp -s "$V/requirements.txt" "$stamp"; then
  echo "    installing Python packages (first time takes a few minutes)"
  "$V/.venv/bin/pip" install -q --upgrade pip
  "$V/.venv/bin/pip" install -q -r "$V/requirements.txt"
  # --no-deps: openwakeword's metadata wants tflite-runtime (no wheel for new Pythons); we use ONNX
  "$V/.venv/bin/pip" install -q --no-deps openwakeword==0.6.0
  cp "$V/requirements.txt" "$stamp"
fi
"$V/.venv/bin/python" "$V/listener.py" --download | tail -1

# Shared secret between the listener and the backend. The backend reads it on its
# next restart, which deploy.sh does right after this script.
if ! grep -q '^VOICE_TOKEN=' "$ENV_FILE"; then
  echo "    generating VOICE_TOKEN in backend/.env"
  echo "VOICE_TOKEN=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$ENV_FILE"
fi

sed "s/__USER__/$ME/" "$APP/deploy/sentinel-voice.service" | sudo tee /etc/systemd/system/sentinel-voice.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable -q sentinel-voice
sudo systemctl restart sentinel-voice
echo "    sentinel-voice (re)started"
