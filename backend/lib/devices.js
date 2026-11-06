// Device layer shared by scenes, rules and Game Day: one place that knows how to
// talk to Govee, Hue and the Frame TVs. Every call reports a short result string;
// a failing integration never throws past this module.
const axios = require('axios');
const { GOVEE_API_KEY, GOVEE_BASE_URL, HUE_BRIDGE_IP, HUE_USERNAME } = require('./config');
const { SMARTTHINGS_BASE_URL, getSmartThingsToken } = require('./smartthings');
const { rgbToHueBridgeHSB } = require('./color');

// H6076 lists color/brightness but ignores them via the API (see goveeCapabilities.js)
const GOVEE_POWER_ONLY = ['H6076'];
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const GOVEE_GAP_MS = process.env.GOVEE_GAP_MS !== undefined ? Number(process.env.GOVEE_GAP_MS) : 250;
const goveeHeaders = () => ({ 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' });

async function goveeDevices() {
  const { data } = await axios.get(`${GOVEE_BASE_URL}/devices`, { headers: goveeHeaders() });
  return (data?.data?.devices || []).map((d) => {
    const quirk = GOVEE_POWER_ONLY.some((m) => String(d.model || '').toUpperCase().startsWith(m));
    const cmds = new Set(quirk ? ['turn'] : d.supportCmds || ['turn']);
    return { ...d, can: (c) => cmds.has(c) };
  });
}

const goveeSend = (d, cmd) => axios.put(`${GOVEE_BASE_URL}/devices/control`,
  { device: d.device, model: d.model, cmd }, { headers: goveeHeaders(), timeout: 8000 });

// Why a Govee call failed, in words. Govee reports some failures in-band (HTTP 200 with
// a non-200 `code`), others as HTTP errors; 429 = rate limited.
function goveeFailure(err, res) {
  if (res) return `${res.data?.message || 'rejected'} (code ${res.data?.code})`;
  const st = err?.response?.status;
  const msg = err?.response?.data?.message || err?.message || 'failed';
  return st ? `${msg} (HTTP ${st})` : msg;
}

// One command with one retry for the failures that are usually transient.
async function goveeCommand(d, cmd) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await goveeSend(d, cmd);
      if ((res?.data?.code ?? 200) === 200) return null;
      if (attempt === 0 && /busy|limit|timeout/i.test(res.data?.message || '')) { await delay(1200); continue; }
      return goveeFailure(null, res);
    } catch (err) {
      const st = err?.response?.status;
      if (attempt === 0 && (st === 429 || st >= 500 || !st)) { await delay(st === 429 ? 2000 : 1000); continue; }
      return goveeFailure(err);
    }
  }
  return 'failed after retry';
}

// Apply a light state to every Govee device that supports each part of it.
// colorFor(index) lets callers alternate colors across strips (Game Day).
// Sent one at a time with a short gap: Govee's cloud drops bursts of parallel commands.
async function goveeApply({ on, brightness, color, colorFor, kelvin }) {
  if (!GOVEE_API_KEY) return 'Govee: not configured';
  const devices = await goveeDevices();
  const plan = [];
  let colorIndex = 0;
  for (const d of devices) {
    if (on === false) { plan.push([d, { name: 'turn', value: 'off' }]); continue; }
    const c = colorFor ? colorFor(colorIndex) : color;
    if (c && d.can('color')) { plan.push([d, { name: 'color', value: c }]); colorIndex++; }
    else if (kelvin && d.can('colorTem')) plan.push([d, { name: 'colorTem', value: kelvin }]);
    if (brightness && d.can('brightness')) plan.push([d, { name: 'brightness', value: Math.round(brightness) }]);
    if (on === true && !c && !kelvin && !brightness) plan.push([d, { name: 'turn', value: 'on' }]);
  }
  const failures = [];
  for (const [i, [d, cmd]] of plan.entries()) {
    if (i) await delay(GOVEE_GAP_MS);
    const why = await goveeCommand(d, cmd);
    if (why) failures.push(`${d.deviceName || d.model} ${cmd.name}: ${why}`);
  }
  const head = `Govee: ${plan.length - failures.length}/${plan.length} commands ok`;
  return failures.length ? `${head} (failed: ${failures.join('; ')})` : head;
}

// Hue: group 0 is "all lights" on the bridge; lightIds targets specific lights, and
// colorFor(index) gives each of those lights its own color (Game Day primary/secondary).
function hueState({ on, brightness, color, kelvin }) {
  if (on === false) return { on: false };
  const state = { on: true };
  if (color) Object.assign(state, rgbToHueBridgeHSB(color));
  else if (kelvin) state.ct = Math.min(500, Math.max(153, Math.round(1e6 / kelvin)));   // mireds
  if (brightness) state.bri = Math.max(1, Math.min(254, Math.round(brightness * 2.54)));
  return state;
}

async function hueApply({ on, brightness, color, colorFor, kelvin, lightIds }) {
  if (!HUE_BRIDGE_IP || !HUE_USERNAME) return 'Hue: not configured';
  const base = `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}`;
  if (lightIds?.length) {
    await Promise.all(lightIds.map((id, i) => axios.put(`${base}/lights/${id}/state`,
      hueState({ on, brightness, kelvin, color: colorFor ? colorFor(i) : color }))));
    return `Hue: ${lightIds.length} lights set`;
  }
  const state = hueState({ on, brightness, color, kelvin });
  await axios.put(`${base}/groups/0/action`, state);
  return `Hue: all lights ${state.on ? 'set' : 'off'}`;
}

async function frameTvs() {
  const token = await getSmartThingsToken();
  if (!token) return { token: null, tvs: [] };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { data } = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, { headers });
  const tvs = (data.items || []).filter((d) => d.label?.toLowerCase().includes('frame')
    && d.components?.[0]?.capabilities?.some((c) => c.id === 'samsungvd.mediaInputSource'));
  const send = (tv, capability, command, args = []) => axios.post(`${SMARTTHINGS_BASE_URL}/devices/${tv.deviceId}/commands`,
    { commands: [{ capability, command, arguments: args }] }, { headers });
  return { token, tvs, send };
}


// { power: true|false, artMode: true|false, home: true }
// Local network control (lib/frameTv.js) when FRAME_TVS is set; SmartThings cloud otherwise.
async function tvApply(opts) {
  const frame = require('./frameTv');
  if (frame.configured().length) return frame.apply(opts);
  return smartThingsTvApply(opts);
}

async function smartThingsTvApply({ power, artMode, home }) {
  const { token, tvs, send } = await frameTvs();
  if (!token) return 'TV: SmartThings not connected';
  if (!tvs.length) return 'TV: no Frame TV found';
  await Promise.all(tvs.map(async (tv) => {
    if (artMode === false) await send(tv, 'samsungvd.ambient', 'off');
    if (power === true) await send(tv, 'switch', 'on');
    if (power === false) await send(tv, 'switch', 'off');
    if (artMode === true) await send(tv, 'samsungvd.ambient', 'on');
    if (home) { await delay(2000); await send(tv, 'samsungvd.remoteControl', 'send', ['HOME']); }
  }));
  const what = [power === true && 'on', power === false && 'off', artMode === true && 'art mode', artMode === false && 'art off', home && 'home screen'].filter(Boolean).join(', ');
  return `TV: ${tvs.length} ${tvs.length === 1 ? 'TV' : 'TVs'} ${what}`;
}

module.exports = { goveeApply, hueApply, tvApply, goveeDevices, delay };
