// Weather heads-up: rain/snow/storms starting soon and hard freezes tonight.
//   - spoken on the voice panel + pushed, once per event (checked every 30 min)
//   - one line in the morning briefing and the get_weather answer ("Rain likely from about 4 PM")
// Open-Meteo (free, no key) at HOME_LAT/HOME_LON. Off: WEATHER_ALERTS=off.
const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(
  process.env.WEATHER_ALERTS_STORE_PATH || path.join(__dirname, '..', 'data', 'weather-alerts.json'),
  { label: 'Weather alerts' }
);
const PROB = 60;                 // % chance that counts as "likely"
const LOOKAHEAD_H = 12;
const SOON_MS = 90 * 60_000;
let timer = null;

const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const dayKey = (d) => d.toDateString();
function kindOf(code, prob) {
  if ([95, 96, 99].includes(code)) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return prob >= PROB ? 'rain' : null;
}

async function forecast(fetchImpl = fetch) {
  const lat = Number(process.env.HOME_LAT), lon = Number(process.env.HOME_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const q = new URLSearchParams({ latitude: lat, longitude: lon, hourly: 'precipitation_probability,weather_code,temperature_2m',
    daily: 'temperature_2m_min', temperature_unit: 'fahrenheit', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, forecast_days: '2' });
  const res = await fetchImpl(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
  return res.ok ? res.json() : null;
}

// -> { precip: { kind, at: Date, prob } | null, freeze: { low } | null }
function analyze(fc, now = new Date()) {
  const h = fc?.hourly || {};
  let precip = null;
  for (let i = 0; i < (h.time || []).length; i++) {
    const at = new Date(h.time[i]);                       // local "YYYY-MM-DDTHH:MM"
    if (at < new Date(now.getTime() - 3600e3) || at > new Date(now.getTime() + LOOKAHEAD_H * 3600e3)) continue;
    const prob = h.precipitation_probability?.[i] ?? 0;
    const kind = kindOf(h.weather_code?.[i], prob);
    if (kind && (prob >= PROB || kind === 'storm')) { precip = { kind, at: at < now ? now : at, prob }; break; }
  }
  // Tonight's low: the coldest hour between 6 PM today and 9 AM tomorrow
  const evening = new Date(now); evening.setHours(18, 0, 0, 0);
  const morning = new Date(now); morning.setDate(morning.getDate() + 1); morning.setHours(9, 0, 0, 0);
  const tonight = (h.time || []).map((t, i) => [new Date(t), h.temperature_2m?.[i]])
    .filter(([t, v]) => t >= evening && t <= morning && v != null).map(([, v]) => v);
  const low = tonight.length ? Math.round(Math.min(...tonight)) : null;
  return { precip, freeze: low != null && low <= 32 ? { low } : null };
}

const WORD = { rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms' };
// One line for the briefing / get_weather. '' when nothing to flag.
function headsUpLine(a, now = new Date()) {
  const parts = [];
  if (a.precip) parts.push(a.precip.at - now < 15 * 60_000 ? `${WORD[a.precip.kind]} likely now` : `${WORD[a.precip.kind]} likely from about ${clock(a.precip.at)}`);
  if (a.freeze) parts.push(`freezing tonight, down to ${a.freeze.low}`);
  return parts.length ? `Heads up: ${parts.join('; ')}.` : '';
}

async function headsUp({ now = new Date(), fetchImpl } = {}) {
  try { return headsUpLine(analyze(await forecast(fetchImpl), now), now); } catch { return ''; }
}

// Proactive check: say it once per event
async function tick(now = new Date(), { fetchImpl, say = announce } = {}) {
  if (process.env.WEATHER_ALERTS === 'off') return [];
  let a;
  try { a = analyze(await forecast(fetchImpl), now); } catch { return []; }
  const sent = store.get('sent') || {};
  const out = [];
  if (a.precip && a.precip.at - now <= SOON_MS) {
    const key = `${a.precip.kind}:${dayKey(a.precip.at)}`;
    if (!sent[key]) {
      sent[key] = now.toISOString();
      out.push(a.precip.kind === 'storm'
        ? `Heads up: thunderstorms around ${clock(a.precip.at)}.`
        : `Heads up: ${a.precip.kind} starting around ${clock(a.precip.at)}.${a.precip.kind === 'rain' ? " Grab an umbrella if you're heading out." : ' Roads may get slick.'}`);
    }
  }
  if (a.freeze && now.getHours() >= 16 && now.getHours() < 22) {
    const key = `freeze:${dayKey(now)}`;
    if (!sent[key]) { sent[key] = now.toISOString(); out.push(`Freezing tonight, down to ${a.freeze.low} degrees.`); }
  }
  // keep a week of history
  const weekAgo = now.getTime() - 7 * 86400e3;
  store.set('sent', Object.fromEntries(Object.entries(sent).filter(([, at]) => Date.parse(at) > weekAgo)));
  for (const text of out) await say(text, a);
  return out;
}

async function announce(text, a) {
  try { require('../routes/voice').announce(text); } catch { /* no panel */ }
  require('./notify').notify({ title: text.replace(/^Heads up: /, '').split('.')[0], message: text, category: 'weather',
    priority: a?.precip?.kind === 'storm' ? 4 : 3, tags: [a?.precip?.kind === 'snow' ? 'snowflake' : a?.freeze ? 'cold_face' : 'umbrella'] });
}

function start({ intervalMs = Number(process.env.WEATHER_ALERTS_INTERVAL_MS) || 30 * 60_000 } = {}) {
  if (timer) return;
  setTimeout(() => tick().catch(() => {}), 60_000).unref?.();
  timer = setInterval(() => tick().catch(() => {}), intervalMs);
  timer.unref?.();
}

const _reset = () => store.set('sent', {});
module.exports = { analyze, headsUpLine, headsUp, tick, start, _reset };
