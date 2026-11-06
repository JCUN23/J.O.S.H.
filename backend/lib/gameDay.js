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

const alternate = (colors) => (i) => (i % 2 === 0 ? colors.primary : colors.secondary);
const setGoveeColors = (colors) => devices.goveeApply({ colorFor: alternate(colors) });
const setHueColors = (colors) => devices.hueApply({ lightIds: HUE_LIGHTS, colorFor: alternate(colors) });
const wakeFrameTv = () => devices.tvApply({ artMode: false, power: true, home: true });

// Lights (+ TV unless lightsOnly). Each step reports its own result; one failing
// integration never blocks the others.
async function activate(team, { lightsOnly = false, reason = 'manual' } = {}) {
  const steps = [setGoveeColors(team.colors), setHueColors(team.colors)];
  if (!lightsOnly) steps.push(wakeFrameTv());
  const results = (await Promise.allSettled(steps)).map((r) =>
    r.status === 'fulfilled' ? r.value : `error: ${r.reason?.response?.data?.message || r.reason?.message}`);
  const entry = { team: team.name, at: new Date().toISOString(), reason, lightsOnly, results };
  state.set('last', entry);
  activity.log({ source: reason.startsWith('auto') ? 'gameday' : reason, title: `Game Day: ${team.name}`, results });
  if (reason.startsWith('auto')) {
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
      await act(team, { reason: 'auto: game is live' });
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

module.exports = { activate, checkOnce, startWatcher, status, liveEvent, _state: state };
