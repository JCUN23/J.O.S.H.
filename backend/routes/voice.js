// Pi mic relay. voice/listener.py (systemd sentinel-voice) hears the wake word, records
// the command and posts it here; we transcribe it (Groq Whisper) and either
//   - hand the text to the open voice panel (the tablet runs it like a spoken command and
//     speaks the reply), or
//   - with no panel open, run it here with the same agent and return the reply so the
//     Pi can speak it on its own speaker.
//
// The Pi's calls carry VOICE_TOKEN (generated into .env by scripts/voice-install.sh).
// "Localhost only" would protect nothing: Tailscale Serve forwards the tablet's requests
// to us from 127.0.0.1 too.
const express = require('express');
const router = express.Router();

const STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
// Spelling hints for Whisper: names it would otherwise mangle.
const STT_PROMPT = 'Alfred, Sentinel. Govee, Hue, Frame TV, Spotify, Game Day, Lions, Pistons, Michigan, Barça.';
const LISTENER_STALE_MS = 150_000;   // heartbeats come every 60 s
const SPEAKING_MAX_MS = 60_000;      // a panel that never says "done" can't mute the Pi for long

let fetchImpl = (...a) => fetch(...a);
let agent = (text, opts) => require('./sentinel').runSentinel(text, opts);
const clients = new Set();           // { res, panel }
let listener = null;                 // last heartbeat from the Pi
let speakingUntil = 0;

const panelCount = () => [...clients].filter((c) => c.panel).length;
const listenerInfo = () => (listener && Date.now() - listener.at < LISTENER_STALE_MS ? listener : null);
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) c.res.write(line);
}

function fromPi(req, res, next) {
  const token = process.env.VOICE_TOKEN;
  if (!token) return res.status(503).json({ error: 'VOICE_TOKEN not set (run scripts/voice-install.sh on the Pi)' });
  if (req.get('x-voice-token') !== token) return res.status(401).json({ error: 'bad voice token' });
  next();
}

// Whisper hears "Alfred, lights off" when the command follows the wake word without a
// pause, and invents short phrases from silence. Strip the first, drop the second.
const JUNK = new Set(['', 'you', 'thank you', 'thanks', 'thanks for watching', 'bye', 'okay', 'hmm']);
function cleanTranscript(text) {
  const t = String(text || '').trim()
    .replace(/^(hey[\s,]+)?(alfred|jarvis|sentinel)\b[\s,.!?]*/i, '')
    .trim();
  return JUNK.has(t.toLowerCase().replace(/[^a-z\s']/g, '').trim()) ? '' : t;
}

async function transcribe(wav) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'command.wav');
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append('prompt', STT_PROMPT);
  const r = await fetchImpl(STT_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`speech-to-text failed (HTTP ${r.status}${body?.error?.message ? `: ${body.error.message}` : ''})`);
  }
  return (await r.json())?.text || '';
}

// ---- from the Pi ----

router.post('/api/voice/heartbeat', fromPi, (req, res) => {
  const first = !listenerInfo();
  listener = { ...(req.body || {}), at: Date.now() };
  if (first) console.log(`🎙️  Pi mic online: ${listener.mic || 'mic'} · wake word "${listener.model || '?'}" · speaker: ${listener.speaker || 'none'}`);
  res.json({ ok: true, panels: panelCount() });
});

// Wake word heard. Tell the panel to show "listening" right away, unless Sentinel is
// talking (its own voice must not wake it).
router.post('/api/voice/wake', fromPi, (req, res) => {
  if (Date.now() < speakingUntil) return res.json({ listen: false, why: 'panel is speaking' });
  broadcast({ type: 'wake' });
  res.json({ listen: true, panels: panelCount() });
});

router.post('/api/voice/utterance', fromPi, express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const wav = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  let text = '';
  if (wav.length > 44) {
    try { text = cleanTranscript(await transcribe(wav)); } catch (err) {
      console.warn(`🎙️  ${err.message}`);
      broadcast({ type: 'error', text: `Pi mic: ${err.message}` });
      return res.status(502).json({ error: err.message });
    }
  }
  if (!text) {
    broadcast({ type: 'nothing' });
    return res.json({ text: '', handledBy: null });
  }
  console.log(`🎙️  Pi mic heard: "${text.slice(0, 200)}"`);
  if (panelCount()) {
    broadcast({ type: 'transcript', text });
    return res.json({ text, handledBy: 'panel' });
  }
  // No panel open: run it here.
  try {
    const spotifyToken = await require('./spotify').getSpotifyAccessToken().catch(() => null);
    const { response } = await agent(text, { spotifyToken });
    broadcast({ type: 'handled', text, reply: response });
    return res.json({ text, handledBy: 'pi', reply: response });
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.warn(`🎙️  Sentinel failed on "${text}": ${detail}`);
    return res.json({ text, handledBy: 'pi', reply: "My AI service isn't responding right now." });
  }
});

// ---- from the panels ----

// The panel says it's talking (or done), so the Pi ignores wake words meanwhile.
router.post('/api/voice/speaking', (req, res) => {
  speakingUntil = req.body?.speaking ? Date.now() + SPEAKING_MAX_MS : 0;
  res.json({ ok: true });
});

router.get('/api/voice/status', (req, res) => {
  res.json({ listener: listenerInfo(), panels: panelCount(), configured: Boolean(process.env.VOICE_TOKEN) });
});

// Server-Sent Events. ?panel=1 = this device runs what the Pi hears.
router.get('/api/voice/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const client = { res, panel: req.query.panel === '1' };
  clients.add(client);
  res.write(`retry: 3000\n\ndata: ${JSON.stringify({ type: 'hello', listener: Boolean(listenerInfo()) })}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
});

router._test = {
  cleanTranscript,
  setFetch: (f) => { fetchImpl = f; },
  setAgent: (f) => { agent = f; },
  reset: () => { listener = null; speakingUntil = 0; for (const c of clients) c.res.end(); clients.clear(); },
};
module.exports = router;
