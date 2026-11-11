#!/usr/bin/env python3
"""Sentinel's ears on the Pi (systemd: sentinel-voice).

  USB mic -> openWakeWord ("Alfred", on-device, always listening)
          -> on wake: record until you stop talking (loudness endpointing, max 10 s)
          -> POST the WAV to the backend (/api/voice/utterance), which transcribes it
             and hands it to the wall panel, or runs it itself when no panel is open
          -> if the Pi ran it and there's a USB speaker: play the reply

Only the few seconds after the wake word ever leave the Pi.

  python listener.py            run (what systemd does)
  python listener.py --levels   mic check: devices, live loudness and wake score
  python listener.py --download fetch the wake word models (install script runs it)

Settings come from /opt/sentinel/backend/.env (environment variables win):
  VOICE_TOKEN        shared secret with the backend (voice-install.sh generates it)
  VOICE_WAKE_MODEL   alfred  (voice/models/<name>.onnx, a built-in like hey_jarvis, or a comma list)
  VOICE_THRESHOLD    0.5    higher = fewer false wakes, more misses
  VOICE_MIC          name fragment or index of the input device (default: first USB mic)
  VOICE_SPEAKER      auto (first USB speaker) | none | an ALSA device like plughw:2,0
  VOICE_MIN_LEVEL    60     lowest loudness that counts as speech (quiet mics)
  VOICE_SPEECH_RATIO 2.0    speech must be this many times the room's noise (was 3: had to shout)
  VOICE_DUCK_ROOM    120    room level to assume once the backend has muted the TV
  VOICE_FOLLOWUP_SECONDS 6  after Alfred answers, listen this long without the wake word (0 = off)
  VOICE_BACKEND      http://127.0.0.1:3001
"""
import argparse
import io
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from collections import deque
from math import gcd

import numpy as np

RATE = 16000           # what openWakeWord and Whisper want
FRAME = 1280           # 80 ms at 16 kHz: openWakeWord's frame size
FRAME_S = FRAME / RATE


def log(msg):
    print(msg, flush=True)


# ---------- settings ----------

def load_env(path):
    out = {}
    try:
        with open(path) as f:
            for line in f:
                if line.lstrip().startswith('#'):
                    continue
                m = re.match(r'\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$', line)
                if not m:
                    continue
                v = m.group(2)
                if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
                    v = v[1:-1]
                out[m.group(1)] = v
    except OSError:
        pass
    return out


class Config:
    def __init__(self, env_path=None):
        env = load_env(env_path or os.environ.get('SENTINEL_ENV', '/opt/sentinel/backend/.env'))
        get = lambda k, d='': os.environ.get(k) or env.get(k) or d
        self.token = get('VOICE_TOKEN')
        self.model = get('VOICE_WAKE_MODEL', 'alfred')
        self.threshold = float(get('VOICE_THRESHOLD', '0.5'))
        self.mic = get('VOICE_MIC')
        self.speaker = get('VOICE_SPEAKER', 'auto')
        self.backend = get('VOICE_BACKEND', 'http://127.0.0.1:3001').rstrip('/')
        self.max_s = float(get('VOICE_MAX_SECONDS', '10'))
        self.end_silence = float(get('VOICE_END_SILENCE', '1.0'))
        self.min_level = float(get('VOICE_MIN_LEVEL', '60'))
        self.speech_ratio = float(get('VOICE_SPEECH_RATIO', '2.0'))
        self.duck_room = float(get('VOICE_DUCK_ROOM', '120'))
        self.followup_s = float(get('VOICE_FOLLOWUP_SECONDS', '6'))    # 0 = no follow-up listening
        self.followups = int(get('VOICE_FOLLOWUPS', '3'))              # follow-ups in a row
        # "Alfred" while he's talking cuts him off. Stricter than a normal wake: the mic also
        # hears his own voice from the panel. 0 = barge-in off.
        self.barge_threshold = float(get('VOICE_BARGE_THRESHOLD', '0.7'))


# ---------- end of speech ----------

class Endpointer:
    """Decides, frame by frame, when a spoken command is over.

    Loudness relative to the room's noise floor (measured just before the wake word).
    push(rms) -> 'more' | 'done' (you spoke, then paused) | 'nothing' (you never spoke)
    """

    # min_level: floor for "that's speech", for a dead-silent room. Low on purpose: some USB
    # mics are quiet (the UM02 puts normal talking at rms 100-300 over a room at ~35).
    def __init__(self, noise_rms, end_silence=1.0, max_s=10.0, start_timeout=5.0, ignore_s=0.25, min_level=60.0, ratio=2.0):
        self.thr = max(noise_rms * ratio, min_level)
        self.end_silence, self.max_s, self.start_timeout, self.ignore_s = end_silence, max_s, start_timeout, ignore_s
        self.t = 0.0
        self.loud_run = 0
        self.started = False
        self.quiet = 0.0

    def push(self, rms):
        self.t += FRAME_S
        loud = rms > self.thr
        self.loud_run = self.loud_run + 1 if loud else 0
        # The tail of "Jarvis" is right after the wake: don't let it count as the command.
        if not self.started and self.t > self.ignore_s and self.loud_run >= 2:
            self.started = True
        if self.started:
            self.quiet = 0.0 if loud else self.quiet + FRAME_S
            if self.quiet >= self.end_silence:
                return 'done'
        if self.t >= self.max_s:
            return 'done' if self.started else 'nothing'
        if not self.started and self.t >= self.start_timeout:
            return 'nothing'
        return 'more'


def noise_floor(levels):
    """The room's quiet level from the last few seconds of frame loudness.

    A low percentile, not the median: the wake word itself is in this window, and
    a median there measures your voice, not the room (Nov 8: "room 394" from a
    room at ~80, so the speech bar sat above the speech).
    """
    return float(np.percentile(levels, 20)) if len(levels) else 0.0


def rms(frame):
    return float(np.sqrt(np.mean(frame.astype(np.float32) ** 2))) if len(frame) else 0.0


def to_wav(samples):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(samples.astype(np.int16).tobytes())
    return buf.getvalue()


# ---------- audio in ----------

def pick_mic(sd, want):
    """-> (device index or None, native rate, name). Prefers a USB mic."""
    devices = sd.query_devices()
    inputs = [(i, d) for i, d in enumerate(devices) if d['max_input_channels'] > 0]
    if not inputs:
        raise SystemExit('No microphone found. Is the USB mic plugged in? (arecord -l)')
    choice = None
    if want:
        if want.isdigit():
            choice = next(((i, d) for i, d in inputs if i == int(want)), None)
        else:
            choice = next(((i, d) for i, d in inputs if want.lower() in d['name'].lower()), None)
        if not choice:
            raise SystemExit(f'VOICE_MIC="{want}" matches no input device. Have: ' + ', '.join(d['name'] for _, d in inputs))
    choice = choice or next(((i, d) for i, d in inputs if 'usb' in d['name'].lower()), None) or inputs[0]
    idx, dev = choice
    for rate in (RATE, int(dev['default_samplerate']), 48000, 44100):
        try:
            sd.check_input_settings(device=idx, samplerate=rate, channels=1, dtype='int16')
            return idx, rate, dev['name']
        except Exception:
            continue
    raise SystemExit(f'"{dev["name"]}" accepts none of 16/44.1/48 kHz mono')


class Mic:
    """80 ms frames at 16 kHz from whatever rate the mic really runs at."""

    def __init__(self, sd, want):
        from scipy.signal import resample_poly
        self._resample = resample_poly
        self.index, self.rate, self.name = pick_mic(sd, want)
        g = gcd(RATE, self.rate)
        self.up, self.down = RATE // g, self.rate // g
        self.q = queue.Queue(maxsize=250)
        self.stream = sd.InputStream(device=self.index, samplerate=self.rate, channels=1, dtype='int16',
                                     blocksize=int(self.rate * FRAME_S), callback=self._cb)

    def _cb(self, indata, frames, t, status):
        try:
            self.q.put_nowait(indata[:, 0].copy())
        except queue.Full:
            pass                                # we fell behind; drop rather than lag

    def frame(self):
        x = self.q.get()
        if self.rate != RATE:
            x = np.clip(self._resample(x.astype(np.float32), self.up, self.down), -32768, 32767).astype(np.int16)
        return x

    def drain(self):
        while True:
            try:
                self.q.get_nowait()
            except queue.Empty:
                return


# ---------- audio out ----------

def find_speaker(setting):
    if setting == 'none':
        return None
    if setting and setting != 'auto':
        return setting
    try:
        out = subprocess.run(['aplay', '-l'], capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return None
    for line in out.splitlines():
        m = re.match(r'card (\d+): .*?, device (\d+):', line)
        if m and 'usb' in line.lower():
            return f'plughw:{m.group(1)},{m.group(2)}'
    return None


# ---------- backend ----------

class Backend:
    def __init__(self, cfg):
        self.cfg = cfg

    def _req(self, path, data, content_type, timeout):
        req = urllib.request.Request(self.cfg.backend + path, data=data, method='POST',
                                     headers={'Content-Type': content_type, 'X-Voice-Token': self.cfg.token})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()

    def get(self, path, timeout=5):
        req = urllib.request.Request(self.cfg.backend + path, headers={'X-Voice-Token': self.cfg.token})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b'{}')

    def post(self, path, body=None, timeout=10):
        return json.loads(self._req(path, json.dumps(body or {}).encode(), 'application/json', timeout) or b'{}')

    def utterance(self, wav, followup=False):
        path = '/api/voice/utterance' + ('?followup=1' if followup else '')
        return json.loads(self._req(path, wav, 'audio/wav', 30) or b'{}')

    def tts(self, text):
        return self._req('/api/tts', json.dumps({'text': text}).encode(), 'application/json', 30)


def http_reason(err):
    if isinstance(err, urllib.error.HTTPError):
        try:
            return f'HTTP {err.code}: {json.loads(err.read()).get("error")}'
        except Exception:
            return f'HTTP {err.code}'
    return str(getattr(err, 'reason', err))


# ---------- main loop ----------

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')


def resolve_models(spec, models_dir=MODELS_DIR):
    """'alfred,hey_jarvis' -> ['<voice>/models/alfred.onnx', 'hey_jarvis'].

    A name with a file in voice/models (or a path to a file) is a custom model;
    anything else is one of openWakeWord's built-ins, downloaded at install.
    """
    out = []
    for name in (n.strip() for n in str(spec).split(',')):
        if not name:
            continue
        local = os.path.join(models_dir, f'{name}.onnx')
        out.append(name if os.path.isfile(name) else local if os.path.isfile(local) else name)
    return out


def wake_phrase(spec):
    """What to tell a person to say: 'alfred' -> 'Alfred', 'hey_jarvis' -> 'Hey Jarvis'."""
    first = str(spec).split(',')[0].strip()
    return os.path.splitext(os.path.basename(first))[0].replace('_', ' ').title()


def load_model(spec):
    from openwakeword.model import Model
    return Model(wakeword_models=resolve_models(spec), inference_framework='onnx')


def score_of(prediction):
    return max(prediction.values()) if prediction else 0.0


def run(cfg):
    import sounddevice as sd
    if not cfg.token:
        raise SystemExit('VOICE_TOKEN missing from /opt/sentinel/backend/.env (run scripts/voice-install.sh)')
    model = load_model(cfg.model)
    mic = Mic(sd, cfg.mic)
    speaker = find_speaker(cfg.speaker)
    api = Backend(cfg)
    log(f'Listening on "{mic.name}" ({mic.rate} Hz) for "{cfg.model}", threshold {cfg.threshold}. '
        f'Speaker: {speaker or "none (replies stay on the panel)"}')

    def heartbeat():
        while True:
            try:
                api.post('/api/voice/heartbeat', {'mic': mic.name, 'rate': mic.rate, 'model': cfg.model,
                                                  'threshold': cfg.threshold, 'speaker': speaker})
            except Exception as e:
                log(f'heartbeat failed ({http_reason(e)}); is the sentinel service up?')
            time.sleep(60)
    threading.Thread(target=heartbeat, daemon=True).start()

    recent = deque(maxlen=62)                   # ~5 s of loudness: the room's noise floor
    cooldown_until = 0.0
    with mic.stream:
        while True:
            f = mic.frame()
            recent.append(rms(f))
            score = score_of(model.predict(f))
            if score < cfg.threshold or time.time() < cooldown_until:
                continue
            log(f'Wake word ({score:.2f})')
            try:
                # A barge-in ("Alfred" over his reply) starts the next command right away
                barged = handle_command(cfg, api, mic, speaker, noise_floor(recent), score=score, model=model)
                while barged:
                    model.reset()
                    barged = handle_command(cfg, api, mic, speaker, noise_floor(recent), score=barged, model=model)
            except Exception as e:
                log(f'Command failed: {http_reason(e)}')
            model.reset()                       # forget the wake word's audio
            mic.drain()                         # and everything heard while we were busy
            cooldown_until = time.time() + 1.5


def wait_for_duck(mic, loud_noise, ratio=2.0, max_s=1.5):
    """The backend just muted the TV, but it takes ~1s to go quiet. In that window music
    alone mustn't start a command (Nov 11: a song got transcribed), but Josh talking over it
    must not be thrown away either (Nov 11, later: skipping it turned "Play Discover Weekly
    on the Frame" into "Weakly on the frame"). So: keep the audio; it only counts as speech
    when it's clearly louder than the music. -> (frames, spoke)"""
    frames, spoke, waited = [], False, 0.0
    while waited < max_s:
        f = mic.frame()
        frames.append(f)
        waited += FRAME_S
        level = rms(f)
        if level > loud_noise * ratio:
            spoke = True                    # talking over the music
        if level < loud_noise * 0.5:
            break                           # the TV has gone quiet
    return frames, spoke


def record(cfg, mic, noise, start_timeout=5.0, prefix=None, started=False):
    """-> (verdict, frames): 'done' with the command's audio, or 'nothing'.
    prefix: audio already captured (the TV-muting window); started: speech was in it."""
    ep = Endpointer(noise, end_silence=cfg.end_silence, max_s=cfg.max_s, start_timeout=start_timeout, min_level=cfg.min_level, ratio=cfg.speech_ratio)
    if started:
        ep.started = True
    frames = list(prefix or [])
    while True:
        f = mic.frame()
        frames.append(f)
        verdict = ep.push(rms(f))
        if verdict != 'more':
            return verdict, frames, ep


def send(api, frames, speaker, followup=False):
    """Post a recorded command; speak a Pi-handled reply. -> the backend's answer"""
    audio = np.concatenate(frames)
    t0 = time.time()
    res = api.utterance(to_wav(audio), followup=followup)
    log(f'  heard "{res.get("text", "")}" ({len(audio) / RATE:.1f}s audio, {time.time() - t0:.1f}s round trip) '
        f'-> {res.get("handledBy") or "nothing"}')
    if res.get('handledBy') == 'pi' and res.get('reply'):
        log(f'  reply: {res["reply"]}')
        if speaker:
            say(api, speaker, res['reply'])
    return res


def follow_up_allowed(res, status):
    """After a command: listen again without the wake word? Not after nothing was heard,
    and not when music just started (the mic would hear the song)."""
    if not res.get('text') or not res.get('handledBy'):
        return False
    if res.get('handledBy') == 'pi':
        return res.get('followup', True)
    return bool(status.get('followup', True)) and not status.get('speaking')


def wait_until_quiet(api, grace=1.2, timeout=60.0, mic=None, model=None, barge=0.0):
    """The panel is speaking the reply: wait for it to finish. -> last voice status, or
    {'barged': score} when "Alfred" was said over him (barge-in; needs mic + model).
    Without a mic it just sleeps between status checks, like before."""
    poll_every = 0.3
    def pause(seconds):
        """Sleep, or (barge-in) keep feeding the wake word model for that long"""
        if not (mic and model and barge > 0):
            time.sleep(seconds)
            return None
        end = time.time() + seconds
        while time.time() < end:
            score = score_of(model.predict(mic.frame()))
            if score >= barge:
                return score
        return None

    hit = pause(grace)                      # the panel reports 'speaking' a beat after the command lands
    if hit:
        return {'barged': hit}
    end = time.time() + timeout
    status = {}
    while time.time() < end:
        try:
            status = api.get('/api/voice/status')
        except Exception:
            return {'speaking': False, 'followup': False}
        if not status.get('speaking'):
            return status
        hit = pause(poll_every)
        if hit:
            return {'barged': hit}
    return status


def handle_command(cfg, api, mic, speaker, noise, score=None, model=None):
    """-> the wake score when Josh said "Alfred" over the reply (the caller starts a new
    command right away), else None"""
    r = api.post('/api/voice/wake', {'score': score} if score is not None else {})
    if not r.get('listen'):
        log(f'  ignored: {r.get("why", "backend said no")}')
        return
    prefix, spoke = [], False
    if r.get('ducked') and noise > cfg.duck_room:
        # The noise floor was measured with the TV playing; it's muted now
        prefix, spoke = wait_for_duck(mic, noise, ratio=cfg.speech_ratio)
        log(f'  TV muted for the command (room was {noise:.0f} with it on; {len(prefix) * FRAME_S:.1f}s while it went quiet{", you were talking" if spoke else ""})')
        noise = cfg.duck_room
    verdict, frames, ep = record(cfg, mic, noise, prefix=prefix, started=spoke)
    if verdict == 'nothing':
        log(f'  no command heard (room {noise:.0f}, needed {ep.thr:.0f}, loudest {max(rms(f) for f in frames):.0f})')
        api.utterance(b'')
        return
    log(f'  room {noise:.0f}, speech threshold {ep.thr:.0f}, loudest {max(rms(f) for f in frames):.0f}')
    res = send(api, frames, speaker)

    # Follow-ups: after Alfred answers, keep listening a few seconds without the wake word
    for _ in range(cfg.followups if cfg.followup_s > 0 else 0):
        status = wait_until_quiet(api, mic=mic, model=model, barge=cfg.barge_threshold) if res.get('handledBy') == 'panel' else {}
        if status.get('barged'):
            log(f'Wake word over the reply ({status["barged"]:.2f}): cutting him off')
            return status['barged']
        if not follow_up_allowed(res, status):
            return
        mic.drain()                                         # nothing from while Alfred was talking
        if not api.post('/api/voice/followup', {}).get('listen'):
            return
        log('  listening for a follow-up')
        verdict, frames, _ = record(cfg, mic, noise, start_timeout=cfg.followup_s)
        if verdict == 'nothing':
            api.utterance(b'', followup=True)               # ends the panel's "listening" quietly
            return
        res = send(api, frames, speaker, followup=True)


def say(api, speaker, text):
    try:
        mp3 = api.tts(text)
        subprocess.run(['mpg123', '-q', '-a', speaker, '-'], input=mp3, timeout=60, check=True)
    except Exception as e:
        log(f'  could not speak the reply on {speaker}: {http_reason(e)}')


# ---------- tools ----------

def download(cfg):
    from openwakeword import utils
    builtin = [m for m in resolve_models(cfg.model) if not m.endswith('.onnx')]
    # The shared feature models always download; builtin wake words only if asked for.
    # (An empty list would mean "every built-in model".)
    utils.download_models(model_names=builtin or ['none'])
    load_model(cfg.model)                       # proves the files + onnxruntime work
    log(f'Wake word "{wake_phrase(cfg.model)}" ready ({cfg.model}).')


def levels(cfg, seconds=20):
    import sounddevice as sd
    log('Input devices:')
    for i, d in enumerate(sd.query_devices()):
        if d['max_input_channels'] > 0:
            log(f'  [{i}] {d["name"]} ({int(d["default_samplerate"])} Hz)')
    mic = Mic(sd, cfg.mic)
    model = load_model(cfg.model)
    log(f'Using "{mic.name}" at {mic.rate} Hz. Speaker: {find_speaker(cfg.speaker) or "none"}')
    log(f'Talk normally, then say "{wake_phrase(cfg.model)}" from where you\'ll stand. Wake fires at {cfg.threshold}.')
    peak, last = 0.0, 0.0
    end = time.time() + seconds
    with mic.stream:
        while time.time() < end:
            f = mic.frame()
            peak = max(peak, score_of(model.predict(f)))
            level = rms(f)
            if time.time() - last > 0.5:
                bar = '#' * min(40, int(level / 100))
                log(f'  level {level:6.0f} {bar:<40} wake {peak:.2f}{"  <-- WAKE" if peak >= cfg.threshold else ""}')
                peak, last = 0.0, time.time()


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--levels', action='store_true', help='mic check: live loudness + wake score for 20 s')
    p.add_argument('--download', action='store_true', help='download the wake word model and exit')
    a = p.parse_args(argv)
    cfg = Config()
    if a.download:
        return download(cfg)
    if a.levels:
        return levels(cfg)
    run(cfg)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
