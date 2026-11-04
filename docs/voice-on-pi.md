# Plan: hands-free "Sentinel" on the Pi

**Status: parked.** Pick up after the Pi is running Sentinel (`docs/pi-setup.md`).

## Why

On Android, Chrome's speech recognition takes audio focus every time it
(re)starts. Always-on wake-word listening on the wall tablet therefore made
Spotify on the tablet pause and resume constantly. Wake word now defaults off on
Android (tap-to-talk still works).

Fix: move the always-listening ears to the Pi. The tablet becomes a pure display
and never opens its microphone, so there's no audio-focus fight.

## Architecture

```
 USB mic ─► Pi: sentinel-voice (Python, systemd)
              1. openWakeWord: always listening, local, tiny CPU
              2. on wake: record until silence (VAD, max ~8 s)
              3. POST WAV ──────────────► backend (same Pi, localhost)
                                           4. speech-to-text (Groq Whisper)
                                           5. SSE event: { transcript }
 Wall tablet ◄── GET /api/voice/events ───┘
   6. runs the existing processVoiceCommand(transcript)
   7. speaks the reply with the existing speak() (ElevenLabs)
```

Design choices:

- **Reuse the existing command pipeline.** The panel already turns a transcript
  into actions and speech (`processVoiceCommand` → `sentinelLocal` → `speak`).
  The Pi only supplies transcripts, so there's no second command engine to maintain.
- **One "voice panel" per house.** Every open dashboard receives the SSE stream,
  so only the device flagged as the voice panel may act on it (a per-device
  setting, like wake word today). Otherwise the laptop and the tablet would both
  run "lights off".
- **STT through Groq,** whose key is already in `.env`. Running Whisper on a
  2GB Pi is possible but slow; a hosted call keeps latency around a second.
  Only the few seconds after the wake word are sent, never the always-on stream.

## Pieces to build

### Pi: `voice/` (Python service)

- `voice/listener.py`: 16 kHz mono capture (`sounddevice`), openWakeWord
  detection, `webrtcvad` end-of-speech, POST to `http://127.0.0.1:3001/api/voice/utterance`
- `voice/requirements.txt`, run in a venv: `/opt/sentinel/voice/.venv`
- `deploy/sentinel-voice.service`: systemd unit, `After=sentinel.service`
- Extend `scripts/pi-bootstrap.sh` (venv + unit) and `scripts/deploy.sh` (ship `voice/`)

### Backend

- `POST /api/voice/utterance`: WAV in → Groq transcription → broadcast
  `{ type: 'transcript', text }`. Also broadcast `{ type: 'wake' }` when the
  Pi signals detection, so the panel can show "listening…" instantly.
- `GET /api/voice/events`: Server-Sent Events stream (keep-alive pings,
  auto-reconnect handled by `EventSource`).
- `POST /api/voice/speaking`: panel reports TTS start/stop. The backend ignores
  wake events while Sentinel is talking, so it can't trigger itself.

### Frontend

- `useVoiceEvents()` hook: `EventSource` → wake / transcript / response UI state
- Per-device "Voice panel" toggle (Widgets menu), default off
- VoiceAssistant: show "Listening on the Pi" when the stream is connected

## Phases

1. **Hardware smoke test (30 min).** Plug in the mic, record with `arecord`, play it back.
2. **Wake word with a stock model (1 evening).** openWakeWord ships pretrained
   models (e.g. "hey jarvis"). Prove the whole pipeline end to end before
   training anything custom.
3. **Backend + panel wiring (1 evening).** Utterance endpoint, SSE, voice-panel flag.
4. **Custom "Sentinel" model (about 1 hour, mostly waiting).** openWakeWord's
   training notebook generates synthetic speech for the phrase. Swap it in.
5. **Polish.** Tune detection threshold, self-trigger guard, add a wake chime.

## Hardware to order now

A USB microphone that is **class-compliant** (plug-and-play on Linux, no driver)
and **omnidirectional** (picks up the whole room). A basic USB conference mic is
ideal. Avoid gaming headsets and directional podcast mics: they're aimed at one
seat. If the Pi will sit in a closet or behind a TV, get a USB extension cable
so the mic can sit in the open.

## Verify at build time

- openWakeWord install on the Pi's Python version (use the ONNX backend if the
  tflite runtime has no wheel for it)
- Groq's speech-to-text model name and free-tier limits
- Room echo: whether the panel's TTS or music false-triggers the wake word at
  the chosen threshold

## Risks

- **False wakes from TV/music.** Mitigations: threshold tuning, the speaking
  guard, a custom model (more distinctive than a stock phrase).
- **Mic placement matters more than code.** Test from where you'll actually
  stand before tuning anything.
