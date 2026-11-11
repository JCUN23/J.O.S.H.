// Who's home, from Tailscale. Tailscale stays connected on cellular, so "online" means
// nothing here. What matters is HOW the host reaches the phone: `tailscale ping` reports
// the path, and a direct path over a private LAN address (10.x / 192.168.x / 172.16-31.x)
// means the phone is on the home Wi-Fi. Anything else (public IP, DERP relay) = away.
//   PRESENCE_DEVICES=Josh@josh-iphone,Sam@sams-pixel      (Tailscale machine names)
// Phones nap and stop answering, so "left" needs LEAVE_AFTER_MS without a home result;
// "arrived" fires on the first home result after being away.
const { execFile } = require('child_process');
const fs = require('fs');
const activity = require('./activity');
const { notify } = require('./notify');

const LEAVE_AFTER_MS = (Number(process.env.PRESENCE_LEAVE_MIN) || 10) * 60 * 1000;
const MAC_APP_BIN = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';

function people() {
  return (process.env.PRESENCE_DEVICES || '').split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const at = entry.lastIndexOf('@');
    const name = (at > 0 ? entry.slice(0, at) : entry).trim();
    const device = (at > 0 ? entry.slice(at + 1) : entry).trim();
    return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, device };
  });
}

function tailscaleBin() {
  if (process.env.TAILSCALE_BIN) return process.env.TAILSCALE_BIN;
  if (process.platform === 'darwin' && fs.existsSync(MAC_APP_BIN)) return MAC_APP_BIN;
  return 'tailscale';
}

const run = (args, timeout = 12000) => new Promise((resolve) => {
  execFile(tailscaleBin(), args, { timeout }, (err, stdout, stderr) =>
    resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`, code: err?.code }));
});

const isLanIp = (ip) => /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  || /^fe80:/i.test(ip) || /^f[cd][0-9a-f]{2}:/i.test(ip);

// "pong from josh-iphone (100.x.y.z) via 10.0.0.12:41641 in 23ms"  -> home
// "pong from josh-iphone (100.x.y.z) via DERP(ord) in 80ms"          -> away
// "pong from ... via 172.58.1.2:41641 in 60ms" (carrier IP)          -> away
// The first pong often goes through a relay while the direct path is still being set up,
// so ping a few times (tailscale stops early once it's direct) and judge the LAST pong.
function classify(output) {
  const all = [...(output || '').matchAll(/pong from .*? via (\S+)/gi)];
  const m = all[all.length - 1];
  if (!m) return 'unreachable';
  if (/^DERP/i.test(m[1])) return 'away';
  const ip = m[1].replace(/^\[/, '').replace(/\]?:\d+$/, '');
  return isLanIp(ip) ? 'home' : 'away';
}

async function probe(person) {
  const r = await run(['ping', '--c', '4', '--timeout', '3s', person.device], 20000);
  if (r.code === 'ENOENT') return { result: 'error', detail: 'tailscale CLI not found (set TAILSCALE_BIN)' };
  return { result: classify(r.out), detail: r.out.trim().split('\n').pop() };
}

// ---------- state machine ----------
const state = {};   // id -> { status: 'unknown'|'home'|'away', since, lastHome, lastResult, lastCheck }
let listener = () => {};

// Exported for tests: feed one probe result, get back the event to emit (or null).
function observe(person, result, now = Date.now()) {
  const s = state[person.id] ||= { status: 'unknown', since: now, lastHome: null, started: now };
  s.lastResult = result; s.lastCheck = now;
  const set = (status) => { s.status = status; s.since = now; };
  if (result === 'home') {
    s.lastHome = now; s.awayStreak = 0;
    if (s.status === 'home') return null;
    const wasAway = s.status === 'away';
    set('home');
    return wasAway ? 'arrive' : null;          // first sighting after a restart isn't an arrival
  }
  if (result === 'error') return null;
  s.awayStreak = result === 'away' ? (s.awayStreak || 0) + 1 : 0;
  const quietFor = now - (s.lastHome ?? s.started);
  if (s.status === 'home' && quietFor >= LEAVE_AFTER_MS) { set('away'); return 'leave'; }
  // Just restarted, status unknown: ONE relayed ping (a napping phone) used to mark Josh
  // away, so the next direct ping was an "arrival" and a "Welcome home" briefing, after
  // every deploy (Nov 11). Away now takes 3 away results in a row, or the full timeout.
  if (s.status === 'unknown' && (s.awayStreak >= 3 || quietFor >= LEAVE_AFTER_MS)) set('away');
  return null;
}

const anyoneHome = () => people().some((p) => state[p.id]?.status === 'home');

function snapshot() {
  return people().map((p) => {
    const s = state[p.id] || {};
    return { id: p.id, name: p.name, device: p.device, status: s.status || 'unknown',
      since: s.since ? new Date(s.since).toISOString() : null, lastResult: s.lastResult || null,
      lastCheck: s.lastCheck ? new Date(s.lastCheck).toISOString() : null };
  });
}

async function check(now = Date.now()) {
  for (const person of people()) {
    const { result, detail } = await probe(person);
    if (result === 'error') { state[person.id] = { ...(state[person.id] || { status: 'unknown' }), lastResult: 'error', detail }; continue; }
    const wasAnyoneHome = anyoneHome();
    const event = observe(person, result, now);
    if (!event) continue;
    const everyoneGone = !anyoneHome();
    const title = event === 'arrive' ? `${person.name} got home` : `${person.name} left home`;
    activity.log({ source: 'presence', title, results: [`presence: ${detail}`] });
    notify({ title, category: 'presence', priority: 2, tags: [event === 'arrive' ? 'house' : 'wave'] });
    try {
      await listener({ event, person, firstHome: event === 'arrive' && !wasAnyoneHome, everyoneGone: event === 'leave' && everyoneGone });
    } catch (err) { console.warn('presence listener:', err.message); }
  }
}

// Tailscale peers, so setup can show you the exact machine names to use.
async function peers() {
  const r = await run(['status', '--json']);
  if (!r.ok) return { error: r.code === 'ENOENT' ? 'tailscale CLI not found (set TAILSCALE_BIN)' : r.out.trim().slice(0, 200) };
  try {
    const j = JSON.parse(r.out);
    return { peers: Object.values(j.Peer || {}).map((p) => ({ name: (p.DNSName || '').split('.')[0] || p.HostName,
      os: p.OS, online: p.Online })).sort((a, b) => a.name.localeCompare(b.name)) };
  } catch { return { error: "couldn't read tailscale status" }; }
}

let timer = null;
function start({ onEvent, intervalMs = (Number(process.env.PRESENCE_INTERVAL_S) || 60) * 1000 } = {}) {
  if (timer || !people().length) return false;
  if (onEvent) listener = onEvent;
  const loop = () => check().catch((e) => console.warn('presence check:', e.message));
  loop();
  timer = setInterval(loop, intervalMs);
  timer.unref?.();
  console.log(`Presence on: ${people().map((p) => `${p.name} (${p.device})`).join(', ')}`);
  return true;
}

const _reset = () => { for (const k of Object.keys(state)) delete state[k]; };

module.exports = { people, classify, observe, snapshot, check, peers, start, anyoneHome, LEAVE_AFTER_MS, _reset };
