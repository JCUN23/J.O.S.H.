// Device layer shared by scenes, rules and Game Day: one place that knows how to
// talk to Govee, Hue and the Frame TVs. Every call reports a short result string;
// a failing integration never throws past this module.
const axios = require('axios');
const { GOVEE_API_KEY, GOVEE_BASE_URL, HUE_BRIDGE_IP, HUE_USERNAME } = require('./config');
const { SMARTTHINGS_BASE_URL, getSmartThingsToken } = require('./smartthings');
const { rgbToHueBridgeHSB } = require('./color');

// H6076 lists color/brightness but ignores them via the API (see goveeCapabilities.js)
const GOVEE_POWER_ONLY = ['H6076'];
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
  { device: d.device, model: d.model, cmd }, { headers: goveeHeaders() });

// Count a Govee call as OK only if Govee's in-band code says so
const goveeOk = (r) => r.status === 'fulfilled' && (r.value?.data?.code ?? 200) === 200;

// Apply a light state to every Govee device that supports each part of it.
// colorFor(index) lets callers alternate colors across strips (Game Day).
async function goveeApply({ on, brightness, color, colorFor, kelvin }) {
  if (!GOVEE_API_KEY) return 'Govee: not configured';
  const devices = await goveeDevices();
  const ops = [];
  let colorIndex = 0;
  for (const d of devices) {
    if (on === false) { ops.push(goveeSend(d, { name: 'turn', value: 'off' })); continue; }
    const c = colorFor ? colorFor(colorIndex) : color;
    if (c && d.can('color')) { ops.push(goveeSend(d, { name: 'color', value: c })); colorIndex++; }
    else if (kelvin && d.can('colorTem')) ops.push(goveeSend(d, { name: 'colorTem', value: kelvin }));
    if (brightness && d.can('brightness')) ops.push(goveeSend(d, { name: 'brightness', value: Math.round(brightness) }));
    if (on === true && !c && !kelvin && !brightness) ops.push(goveeSend(d, { name: 'turn', value: 'on' }));
  }
  const results = await Promise.allSettled(ops);
  return `Govee: ${results.filter(goveeOk).length}/${results.length} commands ok`;
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

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// { power: true|false, artMode: true|false, home: true }
async function tvApply({ power, artMode, home }) {
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
