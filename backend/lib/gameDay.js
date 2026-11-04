// Game Day: when a followed team's game goes live, set the lights to team colors
// and wake the Frame TV. Runs on the server so it works with no browser open, and
// fires ONCE per game (keyed by ESPN event id, remembered across restarts).
//
// Previously the Sports widget did this in the browser: every open device fired it,
// and every page reload during a game fired it again.
const axios = require('axios');
const path = require('path');
const { TEAMS } = require('./teams');
const { GOVEE_API_KEY, GOVEE_BASE_URL, HUE_BRIDGE_IP, HUE_USERNAME } = require('./config');
const { SMARTTHINGS_BASE_URL, getSmartThingsToken } = require('./smartthings');
const { rgbToHueBridgeHSB } = require('./color');
const { createJsonStore } = require('./jsonStore');

const state = createJsonStore(
  process.env.GAMEDAY_STORE_PATH || path.join(__dirname, '..', 'data', 'gameday.json'),
  { label: 'Game Day store' }
);

// Hue lights that get team colors, primary then secondary (the two Hue Go lamps)
const HUE_LIGHTS = (process.env.HUE_GAMEDAY_LIGHTS || '5,4').split(',').map((s) => s.trim()).filter(Boolean);
// Same quirk as the Govee widget: H6076 accepts color with "Success" and ignores it
const GOVEE_POWER_ONLY = ['H6076'];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function setGoveeColors(colors) {
  if (!GOVEE_API_KEY) return 'Govee not configured';
  const headers = { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' };
  const { data } = await axios.get(`${GOVEE_BASE_URL}/devices`, { headers });
  // Only devices that actually support color (plugs and the projector don't)
  const strips = (data?.data?.devices || []).filter((d) =>
    (d.supportCmds || []).includes('color')
    && !GOVEE_POWER_ONLY.some((m) => String(d.model || '').toUpperCase().startsWith(m)));
  const results = await Promise.allSettled(strips.map((d, i) =>
    axios.put(`${GOVEE_BASE_URL}/devices/control`,
      { device: d.device, model: d.model, cmd: { name: 'color', value: i % 2 === 0 ? colors.primary : colors.secondary } },
      { headers })));
  const ok = results.filter((r) => r.status === 'fulfilled' && (r.value.data?.code ?? 200) === 200).length;
  return `Govee: ${ok}/${strips.length} lights set`;
}

async function setHueColors(colors) {
  if (!HUE_BRIDGE_IP || !HUE_USERNAME) return 'Hue not configured';
  const shades = [colors.primary, colors.secondary];
  await Promise.all(HUE_LIGHTS.map((id, i) =>
    axios.put(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${id}/state`,
      { on: true, ...rgbToHueBridgeHSB(shades[i % 2]) })));
  return `Hue: ${HUE_LIGHTS.length} lights set`;
}

async function wakeFrameTv() {
  const token = await getSmartThingsToken();
  if (!token) return 'TV: SmartThings not connected';
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { data } = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, { headers });
  const tv = data.items?.find((d) => d.label?.toLowerCase().includes('frame')
    && d.components?.[0]?.capabilities?.some((c) => c.id === 'samsungvd.mediaInputSource'));
  if (!tv) return 'TV: Frame TV not found';
  const send = (capability, command, args = []) => axios.post(`${SMARTTHINGS_BASE_URL}/devices/${tv.deviceId}/commands`,
    { commands: [{ capability, command, arguments: args }] }, { headers });
  await send('samsungvd.ambient', 'off');   // leave Art Mode
  await send('switch', 'on');
  await delay(2000);                        // let it wake before navigating
  await send('samsungvd.remoteControl', 'send', ['HOME']);
  return 'TV: on, home screen';
}

// Lights (+ TV unless lightsOnly). Each step reports its own result; one failing
// integration never blocks the others.
async function activate(team, { lightsOnly = false, reason = 'manual' } = {}) {
  const steps = [setGoveeColors(team.colors), setHueColors(team.colors)];
  if (!lightsOnly) steps.push(wakeFrameTv());
  const results = (await Promise.allSettled(steps)).map((r) =>
    r.status === 'fulfilled' ? r.value : `error: ${r.reason?.response?.data?.message || r.reason?.message}`);
  const entry = { team: team.name, at: new Date().toISOString(), reason, lightsOnly, results };
  state.set('last', entry);
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
