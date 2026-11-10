// Game Day: when a followed team's game goes live, set the lights to team colors
// and wake the Frame TV. Runs on the server so it works with no browser open, and
// fires ONCE per game (keyed by ESPN event id, remembered across restarts).
//
// Previously the Sports widget did this in the browser: every open device fired it,
// and every page reload during a game fired it again.
const path = require('path');
const { TEAMS } = require('./teams');
const devices = require('./devices');
const activity = require('./activity');
const { createJsonStore } = require('./jsonStore');

const state = createJsonStore(
  process.env.GAMEDAY_STORE_PATH || path.join(__dirname, '..', 'data', 'gameday.json'),
  { label: 'Game Day store' }
);

// Hue lights that get team colors, primary then secondary (the two Hue Go lamps)
const HUE_LIGHTS = (process.env.HUE_GAMEDAY_LIGHTS || '5,4').split(',').map((s) => s.trim()).filter(Boolean);

// Which Govee lights and TVs Game Day touches, by name (see devices.nameMatcher):
//   GAMEDAY_GOVEE_LIGHTS="neon,!outdoor"   the indoor neon strips (default)
//   GAMEDAY_TVS="The Frame"                 the TV called "The Frame" (default)
// Set either to "*" to use every device.
const pick = (env, dflt) => { const v = process.env[env]; return v === '*' ? undefined : (v || dflt); };
const GOVEE_ONLY = () => pick('GAMEDAY_GOVEE_LIGHTS', 'neon,!outdoor,!outside,!patio,!porch');
const TV_ONLY = () => pick('GAMEDAY_TVS', 'The Frame');

const alternate = (colors) => (i) => (i % 2 === 0 ? colors.primary : colors.secondary);
const setGoveeColors = (colors) => devices.goveeApply({ colorFor: alternate(colors), only: GOVEE_ONLY() });
const setHueColors = (colors) => devices.hueApply({ lightIds: HUE_LIGHTS, colorFor: alternate(colors) });
// ---------- which streaming app ----------
// ESPN lists each game's networks. A game on Peacock opens Peacock, ESPN+ opens the ESPN
// app, HBO Max or TNT/truTV/TBS open HBO Max, anything else (FOX, CBS, BTN, ESPN, FanDuel Sports...)
// opens Fubo. First matching entry wins; `*` is the fallback; `A|B` tries app names in turn.
//   GAMEDAY_TV_NETWORK_APPS="ESPN+=ESPN,Peacock=Peacock,*=fubo"   replace the whole map
//   GAMEDAY_TV_APP_BARCELONA=ESPN                                 per-team override (wins)
//   GAMEDAY_TV_APP=fubo                                           used when the networks are unknown
//   GAMEDAY_TV_MUTE=false                                         leave the sound alone
// NBCSN: ESPN's name for NBC Sports Network games (Nov 9 Pistons), streamed on Peacock
const DEFAULT_NETWORK_APPS = 'ESPN+=ESPN,Peacock=Peacock,NBC=Peacock,NBCSN=Peacock,NBC Sports Network=Peacock,Prime Video=Prime Video,Amazon Prime Video=Prime Video,HBO Max=HBO Max|Max,Max=HBO Max|Max,TNT=HBO Max|Max,truTV=HBO Max|Max,TBS=HBO Max|Max,*=fubo';
const norm = (x) => String(x).toLowerCase().replace(/\s+/g, '');

// Network names from an ESPN event (schedule and scoreboard feeds shape these differently)
function networksOf(event) {
  const out = [];
  for (const b of event?.competitions?.[0]?.broadcasts || []) {
    for (const n of [b.media?.shortName, b.media?.name, b.name, ...(Array.isArray(b.names) ? b.names : [])]) {
      if (n && !out.some((o) => norm(o) === norm(n))) out.push(n);
    }
  }
  return out;
}

function networkMap() {
  return (process.env.GAMEDAY_TV_NETWORK_APPS || DEFAULT_NETWORK_APPS).split(',').map((pair) => {
    const i = pair.indexOf('=');
    return i > 0 ? [pair.slice(0, i).trim(), pair.slice(i + 1).trim()] : null;
  }).filter(Boolean);
}

// -> { app, why } (app null = no app, just the home screen)
function pickTvApp(team, networks = []) {
  const override = process.env[`GAMEDAY_TV_APP_${String(team?.key || '').toUpperCase().replace(/-/g, '_')}`];
  if (override) return { app: override, why: `${team.name} always opens ${override}` };
  if (networks.length) {
    const map = networkMap();
    for (const [net, app] of map) {
      if (net !== '*' && networks.some((n) => norm(n) === norm(net))) return { app, why: `game is on ${networks.join(' / ')}` };
    }
    const fallback = map.find(([net]) => net === '*');
    if (fallback) return { app: fallback[1], why: `game is on ${networks.join(' / ')}` };
  }
  if (process.env.GAMEDAY_TV_APP) return { app: process.env.GAMEDAY_TV_APP, why: 'default app (network unknown)' };
  return { app: null, why: networks.length ? `game is on ${networks.join(' / ')}` : 'network unknown' };
}

// Manual Game Day: find the team's live game, or the next one within 12h, for its networks.
async function currentEvent(team, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(team.scheduleUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const events = (await res.json())?.events || [];
    const live = events.find((e) => e.competitions?.[0]?.status?.type?.state === 'in');
    if (live) return live;
    const soon = Date.now() + 12 * 3600_000;
    return events.find((e) => e.competitions?.[0]?.status?.type?.state === 'pre' && Date.parse(e.date) < soon) || null;
  } catch { return null; }
}

const wakeFrameTv = async (team, event) => {
  const { app, why } = pickTvApp(team, networksOf(event));
  const r = await devices.tvApply({ only: TV_ONLY(), power: true, artMode: false, app: app || undefined, home: !app,
    mute: process.env.GAMEDAY_TV_MUTE === 'false' ? undefined : true });
  return `${r} (${why})`;
};

// Lights (+ TV unless lightsOnly). Each step reports its own result; one failing
// integration never blocks the others.
async function activate(team, { lightsOnly = false, reason = 'manual', event = null } = {}) {
  // Manual runs look the game up so the TV opens the right app (only matters for Frame TVs)
  if (!lightsOnly && !event && require('./frameTv').configured().length) event = await currentEvent(team);
  const steps = [setGoveeColors(team.colors), setHueColors(team.colors)];
  if (!lightsOnly) steps.push(wakeFrameTv(team, event));
  const results = (await Promise.allSettled(steps)).map((r) =>
    r.status === 'fulfilled' ? r.value : `error: ${r.reason?.response?.data?.message || r.reason?.message}`);
  const entry = { team: team.name, at: new Date().toISOString(), reason, lightsOnly, results };
  state.set('last', entry);
  activity.log({ source: reason.startsWith('auto') ? 'gameday' : reason, title: `Game Day: ${team.name}`, results });
  if (reason.startsWith('auto')) {
    try { require('../routes/voice').announce(`The ${team.name} game is on. Game Day lights are up.`); } catch { /* no panel */ }
    require('./notify').notify({ title: `${team.name} game is on`, message: `Game Day lights are up. ${results.join(' · ')}`,
      category: 'gameday', priority: 3, tags: ['tada'] });
  }
  console.log(`🏟️  Game Day (${reason}) for ${team.name}: ${results.join(' | ')}`);
  return entry;
}

// ---------- watcher ----------

// The event that is live right now in an ESPN team schedule, if any
function liveEvent(schedule) {
  return (schedule?.events || []).find((e) => e.competitions?.[0]?.status?.type?.state === 'in') || null;
}

// One pass: activate for each team whose game just went live (once per event id).
async function checkOnce(fetchImpl = fetch, act = activate) {
  const seen = state.get('triggered') || {};
  const fired = [];
  for (const team of TEAMS) {
    try {
      const res = await fetchImpl(team.scheduleUrl, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const event = liveEvent(await res.json());
      if (!event || seen[event.id]) continue;
      seen[event.id] = { team: team.key, at: new Date().toISOString() };
      state.set('triggered', pruneOld(seen));   // remember BEFORE acting: never double-fire
      fired.push(team.name);
      await act(team, { reason: 'auto: game is live', event });
    } catch (err) {
      console.warn(`Game Day watcher: ${team.name} check failed (${err.message})`);
    }
  }
  return fired;
}

// Keep the triggered-events map small
function pruneOld(seen, maxAgeMs = 7 * 24 * 3600 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => Date.parse(v.at) > cutoff));
}

let timer = null;
function startWatcher({ intervalMs = Number(process.env.GAMEDAY_INTERVAL_MS) || 2 * 60 * 1000 } = {}) {
  if (timer) return;
  const tick = () => checkOnce().catch((e) => console.warn('Game Day watcher error:', e.message));
  setTimeout(tick, 15_000);                       // let the server settle first
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  console.log(`Game Day watcher on (every ${Math.round(intervalMs / 1000)}s)`);
}

const status = () => ({ auto: Boolean(timer), last: state.get('last'), teams: TEAMS.map((t) => t.name) });

module.exports = { activate, checkOnce, startWatcher, status, liveEvent, networksOf, pickTvApp, _state: state };
