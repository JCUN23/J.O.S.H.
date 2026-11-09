# Hands-free Sentinel: the Pi mic

Say **"Alfred"**, then the command: "Alfred, turn off the lights." A USB mic on the Pi hears it; the wall
panel (or the Pi itself) runs it.

```
 USB mic ─► Pi: sentinel-voice (voice/listener.py, systemd)
              1. openWakeWord "Alfred": always on, on-device, tiny CPU
              2. on wake: record until you pause (1 s), max 10 s
              3. POST the WAV ───────────► backend routes/voice.js (same Pi)
                                           4. Groq Whisper speech-to-text
               ┌── voice panel open? ──────┤
               │ yes                       │ no
 Wall tablet ◄─┘ SSE /api/voice/events     5. run it here (same agent as chat)
   runs it like a spoken command,          6. reply back to the Pi, spoken on a
   speaks the reply                           USB speaker if one is plugged in
```

Only the seconds after the wake word leave the Pi.

## Install

`npm run deploy` does it (`scripts/voice-install.sh` on the Pi): apt packages,
a Python venv in `/opt/sentinel/voice/.venv`, the wake word model, a
`VOICE_TOKEN` in `backend/.env`, and the `sentinel-voice` service.
`SKIP_VOICE=1 npm run deploy` leaves it alone.

## Check the mic

```bash
ssh -t sentinel-pi 'sudo systemctl stop sentinel-voice; /opt/sentinel/voice/.venv/bin/python /opt/sentinel/voice/listener.py --levels; sudo systemctl start sentinel-voice'
```

20 seconds of live loudness and wake score. Talk normally, then say "Alfred"
from where you'll actually stand. The wake score should jump past the threshold
(0.5) for "Alfred" and stay low for everything else.

## Day to day

| What | How |
|---|---|
| Logs (wakes, what it heard, round trip) | `ssh sentinel-pi journalctl -u sentinel-voice -f` |
| Is it online? | `curl -s https://sentinel.tail24ef52.ts.net/api/voice/status` |
| Which device runs commands | Widgets menu → **Pi mic replies here** (per device; on by default in the installed app) |
| Too many false wakes | raise `VOICE_THRESHOLD` (0.6–0.7) in `backend/.env`, restart `sentinel-voice` |
| Misses you | lower it (0.4), or move the mic into the open |
| Pick a different mic | `VOICE_MIC=<name fragment>` (names: `--levels`) |

The panel tells the backend while it's talking, and wake words are ignored then,
so Sentinel's own voice can't wake it. A face-locked or closed panel doesn't
count as a voice panel; the Pi handles the command itself.

## Talking without the tablet

Plug a USB speaker (or a USB mic/speaker combo) into the Pi. With no voice
panel open, replies play there (`VOICE_SPEAKER=auto` picks the first USB
playback device). Without a speaker the command still runs; only the spoken
reply is missing.

## Wake word

Default: **Alfred** (`voice/models/alfred.onnx`, MIT, from a community collection;
see `voice/models/README.md` for its test scores). Leading with "Alfred" scores
higher than "Hey Alfred". `VOICE_WAKE_MODEL=alfred,hey_jarvis` listens for both.

To train your own: openWakeWord's `notebooks/automatic_model_training.ipynb` in
Google Colab (free, about an hour, mostly waiting). Drop the `.onnx` into
`voice/models/`, set `VOICE_WAKE_MODEL` to its name, deploy.

## Later

- A wake chime on the panel.
