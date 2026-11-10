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
const clients = new Set();           // { res, panel, at }
let seq = 0;
let listener = null;                 // last heartbeat from the Pi
let speakingUntil = 0;
let followupOk = true;               // false right after music started: the mic would hear the song

const panelCount = () => [...clients].filter((c) => c.panel).length;
const listenerInfo = () => (listener && Date.now() - listener.at < LISTENER_STALE_MS ? listener : null);
function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) c.res.write(line);
}
// A command runs on exactly ONE panel: the most recently connected voice panel. Sending
// it to every panel ran it once per open connection (a second tab, or a stale connection
// from before the tablet slept): two plays, two replies (Nov 9).
function sendToOnePanel(event) {
  const panels = [...clients].filter((c) => c.panel).sort((a, b) => b.at - a.at);
  if (!panels.length) return false;
  panels[0].res.write(`data: ${JSON.stringify({ ...event, id: ++seq })}\n\n`);
  return true;
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
// Ducking: the TV is muted from the wake word until the conversation is over, then
// restored (see frameTv.duck). Every voice step pushes the restore out; the waits below
// cover Alfred's reply and the follow-up window. VOICE_DUCK_TV=off turns it off.
let restoreTimer = null;
function restoreTvIn(ms) {
  if (!restoreTimer && !require('../lib/frameTv').isDucked()) return;
  clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => { restoreTimer = null; require('../lib/frameTv').unduck().catch(() => {}); }, ms);
  restoreTimer.unref?.();
}
async function duckTv() {
  if (process.env.VOICE_DUCK_TV === 'off') return false;
  const frame = require('../lib/frameTv');
  if (!frame.configured().length) return false;
  const ducked = await Promise.race([frame.duck().catch(() => false), new Promise((r) => setTimeout(() => r(false), 1200))]);
  if (ducked) restoreTvIn(25_000);
  return ducked;
}

router.post('/api/voice/wake', fromPi, async (req, res) => {
  if (Date.now() < speakingUntil) return res.json({ listen: false, why: 'panel is speaking' });
  broadcast({ type: 'wake' });
  const ducked = await duckTv();
  res.json({ listen: true, panels: panelCount(), ducked });
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
  const followup = req.query.followup === '1';
  if (!text) {
    restoreTvIn(800);   // conversation over: sound back on
    // Silence after a follow-up window is normal: end it quietly, no "didn't catch that"
    broadcast({ type: followup ? 'idle' : 'nothing' });
    return res.json({ text: '', handledBy: null });
  }
  console.log(`🎙️  Pi mic heard: "${text.slice(0, 200)}"`);
  if (sendToOnePanel({ type: 'transcript', text })) return res.json({ text, handledBy: 'panel' });
  // No panel open: run it here.
  try {
    const spotifyToken = await require('./spotify').getSpotifyAccessToken().catch(() => null);
    const { response, toolsExecuted = [] } = await agent(text, { spotifyToken });
    const music = toolsExecuted.some((t) => t.tool === 'play_music' || (t.tool === 'control_spotify' && t.args?.action === 'play'));
    broadcast({ type: 'handled', text, reply: response });
    return res.json({ text, handledBy: 'pi', reply: response, followup: !music });
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
  if (req.body?.speaking) followupOk = true;
  else if (req.body?.followup === false) followupOk = false;
  // Reply started: hold the duck while he talks. Finished: room for the follow-up window.
  restoreTvIn(req.body?.speaking ? SPEAKING_MAX_MS + 5000 : (followupOk && process.env.VOICE_FOLLOWUP !== 'off' ? 9000 : 1000));
  res.json({ ok: true });
});

// Follow-up listening (the Pi, right after Alfred finished answering): show "listening"
// on the panel. Not while he's still talking, and not after music started.
router.post('/api/voice/followup', fromPi, (req, res) => {
  if (process.env.VOICE_FOLLOWUP === 'off') return res.json({ listen: false, why: 'follow-ups off' });
  if (Date.now() < speakingUntil) return res.json({ listen: false, why: 'panel is speaking' });
  if (!followupOk) return res.json({ listen: false, why: 'music is playing' });
  broadcast({ type: 'wake', followup: true });
  restoreTvIn(15_000);
  res.json({ listen: true, ducked: require('../lib/frameTv').isDucked() });
});

router.get('/api/voice/status', (req, res) => {
  res.json({ listener: listenerInfo(), panels: panelCount(), configured: Boolean(process.env.VOICE_TOKEN),
    speaking: Date.now() < speakingUntil, followup: followupOk && process.env.VOICE_FOLLOWUP !== 'off' });
});

// Server-Sent Events. ?panel=1 = this device runs what the Pi hears.
router.get('/api/voice/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const client = { res, panel: req.query.panel === '1', at: Date.now() };
  clients.add(client);
  res.write(`retry: 3000\n\ndata: ${JSON.stringify({ type: 'hello', listener: Boolean(listenerInfo()) })}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
});

// Something for Alfred to say out loud on the voice panel (timers, reminders, briefings).
// Returns false when no panel is open.
router.announce = (text) => sendToOnePanel({ type: 'announce', text });

router._test = {
  cleanTranscript,
  setFetch: (f) => { fetchImpl = f; },
  setAgent: (f) => { agent = f; },
  reset: () => { listener = null; speakingUntil = 0; followupOk = true; for (const c of clients) c.res.end(); clients.clear(); },
};
module.exports = router;
