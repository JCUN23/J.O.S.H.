// Timers and reminders ("Alfred, set a 10 minute timer", "remind me at 5 to call Mom").
// Saved to data/timers.json so a restart doesn't lose them; checked every few seconds.
// When one is due: Alfred says it on the voice panel, ntfy pushes it to the phone, and
// it's logged in Activity. One that came due while the server was down still fires,
// marked late.
const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(
  process.env.TIMERS_STORE_PATH || path.join(__dirname, '..', 'data', 'timers.json'),
  { label: 'Timers' }
);
const TICK_MS = 5000;
const LATE_MS = 2 * 60_000;
let seq = 0;
let ticker = null;

const all = () => store.get('items') || [];
const save = (items) => store.set('items', items);
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function span(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`, !h && sec && `${sec} second${sec > 1 ? 's' : ''}`].filter(Boolean);
  return parts.join(' ') || '0 seconds';
}

// "17:00", "5:30 pm", "5pm", "2026-11-09 17:00", ISO -> ms (today, or tomorrow if that time
// already passed today) | null
function parseAt(at, now = Date.now()) {
  const s = String(at || '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[t ]\d{1,2}:\d{2}/.test(s)) {
    const d = new Date(s.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +(m[2] || 0);
  const ap = m[3]?.[0];
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function add({ kind, label, dueAt }, now = Date.now()) {
  const item = { id: `${now.toString(36)}-${(seq++).toString(36)}`, kind, label: String(label || '').slice(0, 120), dueAt, createdAt: now };
  save([...all(), item].sort((a, b) => a.dueAt - b.dueAt));
  return item;
}

function setTimer({ minutes = 0, seconds = 0, label } = {}, now = Date.now()) {
  const ms = (Number(minutes) || 0) * 60_000 + (Number(seconds) || 0) * 1000;
  if (ms < 1000 || ms > 24 * 3600_000) return 'Timers can run from 1 second to 24 hours.';
  add({ kind: 'timer', label, dueAt: now + ms }, now);
  return `Timer set for ${span(ms)}${label ? ` (${label})` : ''}.`;
}

function setReminder({ text, at, in_minutes: inMinutes } = {}, now = Date.now()) {
  if (!text) return 'What should I remind Josh about?';
  const dueAt = inMinutes != null ? now + Number(inMinutes) * 60_000 : parseAt(at, now);
  if (!dueAt || Number.isNaN(dueAt) || dueAt <= now) return `I couldn't work out when "${at ?? inMinutes}" is.`;
  if (dueAt - now > 30 * 24 * 3600_000) return 'Reminders can be up to 30 days out.';
  add({ kind: 'reminder', label: text, dueAt }, now);
  const day = new Date(dueAt).toDateString() === new Date(now).toDateString() ? 'today' : new Date(dueAt).toLocaleDateString('en-US', { weekday: 'long' });
  return `I'll remind Josh ${day} at ${clock(dueAt)}: ${text}.`;
}

function describe(now = Date.now()) {
  const items = all();
  if (!items.length) return 'No timers or reminders running.';
  return items.map((t) => (t.kind === 'timer'
    ? `Timer${t.label ? ` (${t.label})` : ''}: ${span(t.dueAt - now)} left`
    : `Reminder at ${clock(t.dueAt)}: ${t.label}`)).join('; ') + '.';
}

// label: matches a label or kind ("pasta", "timer"); "all" or empty = everything
function cancel(label) {
  const q = String(label || '').toLowerCase().trim();
  const items = all();
  const hit = !q || q === 'all' ? items : items.filter((t) => t.id === label || t.label.toLowerCase().includes(q) || t.kind === q || `${t.kind}s` === q);
  if (!hit.length) return `Nothing matching "${label}" is running.`;
  save(items.filter((t) => !hit.includes(t)));
  return `Cancelled ${hit.length === 1 ? (hit[0].label || `the ${hit[0].kind}`) : `${hit.length} timers/reminders`}.`;
}

const announcement = (t, late) => (t.kind === 'timer'
  ? `${late ? 'While I was offline, your' : 'Your'} ${t.label ? `${t.label} ` : ''}timer finished.`
  : `${late ? 'Missed while I was offline: a' : 'A'} reminder, Josh: ${t.label}.`);

// Default announcer: speak on the voice panel, push to the phone, log it.
async function announce(t, text) {
  try { require('../routes/voice').announce(text, 'timers'); } catch { /* no panel open */ }
  require('./notify').notify({ title: t.kind === 'timer' ? 'Timer done' : 'Reminder', message: text, category: 'reminder', priority: 4, tags: [t.kind === 'timer' ? 'alarm_clock' : 'bell'] });
  require('./activity').log({ source: 'voice', title: t.kind === 'timer' ? 'Timer done' : 'Reminder', results: [text] });
}

async function tick(now = Date.now(), announcer = announce) {
  const items = all();
  const due = items.filter((t) => t.dueAt <= now);
  if (!due.length) return [];
  save(items.filter((t) => t.dueAt > now));
  for (const t of due) {
    const text = announcement(t, now - t.dueAt > LATE_MS);
    console.log(`⏰ ${text}`);
    try { await announcer(t, text); } catch (err) { console.warn(`⏰ announce failed: ${err.message}`); }
  }
  return due;
}

function start() {
  if (ticker) return;
  ticker = setInterval(() => tick().catch(() => {}), TICK_MS);
  ticker.unref?.();
}

const list = () => all();

module.exports = { setTimer, setReminder, describe, cancel, tick, start, list, parseAt, span };
