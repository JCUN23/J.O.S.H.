// Samsung Frame TVs over the local network. No SmartThings cloud, no account, no fees.
//   Remote keys  wss://<ip>:8002/api/v2/channels/samsung.remote.control
//   Art mode     wss://<ip>:8002/api/v2/channels/com.samsung.art-app
//   Device info  http://<ip>:8001/api/v2/            (PowerState, wifiMac, model)
//   Power on     Wake-on-LAN to the TV's MAC          (TV setting: "Power On with Mobile")
//   Apps         ed.installedApp.get / ed.apps.launch on the remote channel
//   Mute         UPnP RenderingControl SetMute on :9197 (explicit on/off; KEY_MUTE only toggles)
// The first connection shows an Allow prompt on the TV. The token it hands back is kept
// in the token store, so later connections are silent.
//
// Config: FRAME_TVS=Office@10.0.0.35,Living Room@10.0.0.36
const WebSocket = require('ws');
const dgram = require('dgram');
const crypto = require('crypto');
const axios = require('axios');
const tokens = require('./tokenStore');

const REMOTE = 'samsung.remote.control';
const ART = 'com.samsung.art-app';
const APP_NAME = Buffer.from('Sentinel').toString('base64');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Overridable so tests can stand up a fake TV on localhost.
const opt = () => ({
  scheme: process.env.FRAME_TV_WS_SCHEME || 'wss',
  wsPort: Number(process.env.FRAME_TV_WS_PORT) || 8002,
  httpPort: Number(process.env.FRAME_TV_HTTP_PORT) || 8001,
  wolAddr: process.env.FRAME_TV_WOL_ADDR || '255.255.255.255',
  wolPort: Number(process.env.FRAME_TV_WOL_PORT) || 9,
  bootMs: Number(process.env.FRAME_TV_BOOT_MS) || 20000,
  dmrPort: Number(process.env.FRAME_TV_DMR_PORT) || 9197,
  settleMs: process.env.FRAME_TV_SETTLE_MS !== undefined ? Number(process.env.FRAME_TV_SETTLE_MS) : 1500,
});

function configured() {
  return (process.env.FRAME_TVS || '').split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const at = entry.lastIndexOf('@');
    const name = (at > 0 ? entry.slice(0, at) : entry).trim();
    const host = (at > 0 ? entry.slice(at + 1) : entry).trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || host;
    return { id, name, host };
  });
}
const find = (id) => configured().find((t) => t.id === id) || null;
const key = (tv) => `frametv:${tv.id}`;
const saved = (tv) => tokens.get(key(tv)) || {};
const remember = (tv, patch) => tokens.set(key(tv), { ...saved(tv), ...patch });
// A TV that showed its Allow prompt without an answer (or refused us) needs approval.
// While it does, background work (status polling, rules, Game Day) must NOT connect:
// every connection pops another prompt on the TV. Only the explicit Pair button does.
// (Nov 8: after moving Sentinel to the Pi, the TV prompted on every 30s status poll.)
const needsApproval = {};   // tv.id -> since (ms)
const isPaired = (tv) => Boolean(saved(tv).token) && !needsApproval[tv.id];
const approvalError = () => Object.assign(new Error('TV needs approval: press Pair in the Frame TV widget, then Allow on the TV'), { code: 'needs_approval' });

// Open a channel and resolve once the TV says it's ready. Without a token the TV shows
// its Allow prompt and holds the connection until you answer, hence the long pair timeout.
function open(tv, channel, { timeoutMs = Number(process.env.FRAME_TV_CONNECT_MS) || 8000, pairing = false } = {}) {
  if (needsApproval[tv.id] && !pairing) return Promise.reject(approvalError());
  const { scheme, wsPort } = opt();
  const token = saved(tv).token;
  const url = `${scheme}://${tv.host}:${wsPort}/api/v2/channels/${channel}?name=${APP_NAME}${token ? `&token=${token}` : ''}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 5000 }); // TV cert is self-signed
    let connected = false;                       // did the TV accept us (vs. sit on its prompt)?
    const done = (err) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(readyFallback);
      if (err) { ws.terminate(); reject(err); } else { delete needsApproval[tv.id]; resolve(ws); }
    };
    let readyFallback = null;
    const timer = setTimeout(() => {
      // Socket open but no accept: the TV is showing its Allow prompt. Stop asking until Pair.
      if (!connected && ws.readyState === WebSocket.OPEN) { needsApproval[tv.id] = Date.now(); return done(approvalError()); }
      done(new Error(token ? 'TV did not answer' : 'not paired yet: press Pair, then choose Allow on the TV'));
    }, timeoutMs);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.event === 'ms.channel.connect') {
        connected = true;
        if (msg.data?.token && msg.data.token !== token) remember(tv, { token: msg.data.token, pairedAt: Date.now() });
        if (channel !== ART) done();
        else readyFallback = setTimeout(() => done(), 1500);   // some firmware never sends "ready"
      } else if (msg.event === 'ms.channel.ready') done();
      else if (msg.event === 'ms.channel.unauthorized') {
        needsApproval[tv.id] = Date.now();
        remember(tv, { token: null });             // a refused token is no good anymore
        done(new Error('TV refused Sentinel. Allow it under Settings > General > External Device Manager > Device Connection Manager'));
      }
    });
    ws.on('error', (err) => done(new Error(`can't reach TV at ${tv.host} (${err.code || err.message})`)));
    ws.on('close', () => done(new Error('TV closed the connection')));
  });
}

const pair = (tv) => open(tv, REMOTE, { timeoutMs: 45000, pairing: true }).then((ws) => { ws.close(); return isPaired(tv); });

// Remote keypresses. hold: ms to keep the key down (a long POWER fully turns a Frame off;
// a short one just flips between TV and art mode).
async function sendKey(tv, keyName, { hold = 0 } = {}) {
  const ws = await open(tv, REMOTE);
  const press = (Cmd) => ws.send(JSON.stringify({ method: 'ms.remote.control',
    params: { Cmd, DataOfCmd: keyName, Option: 'false', TypeOfRemote: 'SendRemoteKey' } }));
  try {
    if (hold) { press('Press'); await delay(hold); press('Release'); } else press('Click');
    await delay(300);                     // let it flush before closing
  } finally { ws.close(); }
}

// Art app requests. Replies come back as d2d_service_message events carrying JSON in `data`.
async function artRequest(tv, request, extra = {}, { expect = [], timeoutMs = 6000 } = {}) {
  const ws = await open(tv, ART);
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (fn, v) => { clearTimeout(timer); ws.close(); fn(v); };
    const timer = setTimeout(() => finish(reject, new Error(`TV didn't answer art request "${request}"`)), timeoutMs);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.event !== 'd2d_service_message') return;
      let data; try { data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data; } catch { return; }
      if (!data) return;
      const mine = !data.id || data.id === id || data.request_id === id;
      if (data.event === 'error' && mine) {
        return finish(reject, new Error(`art request "${request}" failed (TV error ${data.error_code ?? '?'})`));
      }
      if (expect.includes(data.event) && mine) finish(resolve, data);
    });
    ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event: 'art_app_request', to: 'host',
      data: JSON.stringify({ request, ...extra, id, request_id: id }) } }));
  });
}

const getArtMode = async (tv) => (await artRequest(tv, 'get_artmode_status', {}, { expect: ['artmode_status'], timeoutMs: 3500 })).value;
const setArtMode = (tv, on) => artRequest(tv, 'set_artmode_status', { value: on ? 'on' : 'off' },
  { expect: ['art_mode_changed', 'artmode_status'] });

// ---------- apps ----------
// Send an event on the remote channel and wait for the TV's reply event of the same name.
async function remoteRequest(tv, event, data, { timeoutMs = 5000 } = {}) {
  const ws = await open(tv, REMOTE);
  return new Promise((resolve, reject) => {
    const finish = (fn, v) => { clearTimeout(timer); ws.close(); fn(v); };
    const timer = setTimeout(() => finish(reject, new Error(`TV didn't answer ${event}`)), timeoutMs);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.event === event) finish(resolve, msg.data);
    });
    ws.send(JSON.stringify({ method: 'ms.channel.emit', params: { event, to: 'host', ...(data ? { data } : {}) } }));
  });
}

// Newer firmware (2024+ Frames included) ignores ed.installedApp.get, but still launches
// an app by id. So: ask the TV first, fall back to this table. Newest id first where an
// app has had several. Sources: samsung-tv-ws-api APPLICATIONS.md, rs.ltd Samsung app ids.
// Fubo's id is from forum posts only. Add or override: FRAME_TV_APP_IDS="Fubo=123;Max=456"
const KNOWN_APPS = [
  { name: 'HBO Max', aliases: ['max', 'hbomax'], ids: ['3202301029760', '3201601007230'] },
  { name: 'Peacock', aliases: ['peacock tv'], ids: ['3202006020991'] },
  { name: 'ESPN', aliases: ['espn+', 'espn plus'], ids: ['3201708014618'] },
  { name: 'Fubo', aliases: ['fubotv', 'fubo tv'], ids: ['3201903017953'] },
  { name: 'Netflix', aliases: [], ids: ['3201907018807', '11101200001'] },
  { name: 'YouTube', aliases: [], ids: ['111299001912'] },
  { name: 'YouTube TV', aliases: [], ids: ['3201707014489'] },
  { name: 'Prime Video', aliases: ['amazon prime', 'prime'], ids: ['3201910019365', '3201512006785'] },
  { name: 'Disney+', aliases: ['disney plus', 'disney'], ids: ['3202204027038', '3202009021709', '3201901017640'] },
  { name: 'Hulu', aliases: [], ids: ['3201601007625'] },
  { name: 'Paramount+', aliases: ['paramount plus', 'paramount'], ids: ['3202110025305', '3201710014981'] },
  { name: 'Apple TV', aliases: [], ids: ['3201807016597'] },
  { name: 'Plex', aliases: [], ids: ['3201512006963'] },
];

function knownApps() {
  const apps = KNOWN_APPS.map((a) => ({ ...a, ids: [...a.ids] }));
  for (const pair of (process.env.FRAME_TV_APP_IDS || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const i = pair.indexOf('=');
    if (i < 1) continue;
    const name = pair.slice(0, i).trim();
    const ids = pair.slice(i + 1).split(',').map((x) => x.trim()).filter(Boolean);
    const hit = apps.find((a) => a.name.toLowerCase() === name.toLowerCase() || a.aliases.includes(name.toLowerCase()));
    if (hit) hit.ids = ids; else apps.push({ name, aliases: [], ids });
  }
  return apps;
}

const appCache = {};   // tv.id -> { at, apps, source }
// -> { source: 'tv' | 'built-in', apps: [{ name, ids, type? }] }
async function getApps(tv, { fresh = false } = {}) {
  const c = appCache[tv.id];
  if (!fresh && c && Date.now() - c.at < 3600_000) return c;
  let entry;
  try {
    const data = await remoteRequest(tv, 'ed.installedApp.get', undefined, { timeoutMs: 3000 });
    const apps = (data?.data || data || []).filter((a) => a.appId && a.name)
      .map((a) => ({ name: a.name, ids: [a.appId], type: a.app_type, aliases: [] }))
      .sort((a, b) => a.name.localeCompare(b.name));
    entry = { at: Date.now(), source: 'tv', apps };
  } catch {
    entry = { at: Date.now(), source: 'built-in', apps: knownApps() };
  }
  appCache[tv.id] = entry;
  return entry;
}

// "YouTube TV", "max", or a raw id. Exact name/alias first, then starts-with, then contains.
async function findApp(tv, query) {
  const q = String(query).trim().toLowerCase();
  const { apps } = await getApps(tv);
  if (/^[\w.]+$/.test(q) && /\d{6,}|\./.test(q) && !apps.some((a) => a.name.toLowerCase() === q)) {
    const owner = apps.find((a) => a.ids.includes(query.trim()));
    return owner ? { ...owner, ids: [query.trim()] } : { name: query.trim(), ids: [query.trim()], aliases: [] };
  }
  return apps.find((a) => a.name.toLowerCase() === q || a.aliases?.includes(q))
    || apps.find((a) => a.name.toLowerCase().startsWith(q))
    || apps.find((a) => a.name.toLowerCase().includes(q)) || null;
}

// REST app state: 'running' | 'installed' | 'missing' | 'unknown' (REST locked on some firmware)
async function appState(tv, id) {
  try {
    const { data } = await axios.get(`http://${tv.host}:${opt().httpPort}/api/v2/applications/${id}`, { timeout: 2500 });
    return data?.running ? 'running' : 'installed';
  } catch (err) {
    return err.response?.status === 404 ? 'missing' : 'unknown';
  }
}

// Poll REST app state until it's running (apps take a few seconds to come up)
async function waitRunning(tv, id, ms) {
  const end = Date.now() + ms;
  let st = await appState(tv, id);
  while (st === 'installed' && Date.now() < end) { await delay(500); st = await appState(tv, id); }
  return st;
}

// Launch styles, in order: the websocket deep link, the websocket native launch, then the
// older REST POST. Different apps/firmware accept different ones; REST state tells us
// which worked. (Nov 6: HBO Max installed, DEEP_LINK alone didn't start it.)
const LAUNCHERS = [
  ['deep link', (tv, id) => remoteRequest(tv, 'ed.apps.launch', { appId: id, action_type: 'DEEP_LINK', metaTag: '' }, { timeoutMs: 3000 })],
  ['native', (tv, id) => remoteRequest(tv, 'ed.apps.launch', { appId: id, action_type: 'NATIVE_LAUNCH', metaTag: '' }, { timeoutMs: 3000 })],
  ['REST', (tv, id) => axios.post(`http://${tv.host}:${opt().httpPort}/api/v2/applications/${id}`, null, { timeout: 3000 })],
];

async function launchApp(tv, query) {
  let app = null;
  for (const q of String(query).split('|')) { app = await findApp(tv, q); if (app) break; }  // "HBO Max|Max"
  if (!app) throw new Error(`no app matching "${query}" on the TV`);
  const waitMs = Number(process.env.FRAME_TV_APP_WAIT_MS) || 6000;
  let missing = 0;
  const tried = [];
  for (const id of app.ids) {
    if ((await appState(tv, id)) === 'missing') { missing++; continue; }   // wrong id for this model
    // App list told us the type: native apps (4) go native first, the rest deep link first
    const order = app.type === 4 ? [LAUNCHERS[1], LAUNCHERS[0], LAUNCHERS[2]] : LAUNCHERS;
    for (const [style, launch] of order) {
      try { await launch(tv, id); } catch { /* many TVs launch without replying */ }
      const st = await waitRunning(tv, id, waitMs);
      if (st === 'running') return app.name;
      if (st === 'unknown') return `${app.name} (sent; TV doesn't confirm launches)`;
      tried.push(style);
    }
  }
  throw new Error(missing === app.ids.length
    ? `${app.name} isn't installed on the TV (or its app id changed: set FRAME_TV_APP_IDS)`
    : `${app.name} didn't start (tried ${tried.join(', ')})`);
}

// Art mode only when it needs changing: some firmware never answers a request for the
// state it's already in (Nov 6: "TV didn't answer art request set_artmode_status").
async function ensureArtMode(tv, on) {
  let current = null;
  try { current = await getArtMode(tv); } catch { /* status unsupported: just try */ }
  if (current === (on ? 'on' : 'off')) return on ? 'art mode (already)' : 'art already off';
  try {
    await setArtMode(tv, on);
  } catch (err) {
    // No reply isn't failure: re-read the state and report what's actually true.
    let now = null;
    try { now = await getArtMode(tv); } catch { /* still nothing */ }
    if (now === (on ? 'on' : 'off')) return on ? 'art mode' : 'art off';
    if (!on && now == null && current == null) return 'art off sent (TV gave no art status)';
    throw err;
  }
  return on ? 'art mode' : 'art off';
}

// ---------- mute ----------
// UPnP sets mute to an explicit state. KEY_MUTE only toggles, so it's the fallback, and
// we say so: if the TV was already muted, a toggle unmutes it.
async function setMute(tv, on) {
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetMute xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>${on ? 1 : 0}</DesiredMute></u:SetMute></s:Body></s:Envelope>`;
  try {
    await axios.post(`http://${tv.host}:${opt().dmrPort}/upnp/control/RenderingControl1`, body, {
      timeout: 3000,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: '"urn:schemas-upnp-org:service:RenderingControl:1#SetMute"' },
    });
    return on ? 'muted' : 'unmuted';
  } catch {
    await sendKey(tv, 'KEY_MUTE');
    return 'mute toggled (TV wouldn\'t set mute directly; press mute if it\'s now loud)';
  }
}

// REST info: null means unreachable (fully off, or network standby disabled).
async function info(tv) {
  try {
    const { data } = await axios.get(`http://${tv.host}:${opt().httpPort}/api/v2/`, { timeout: 2500 });
    const d = data.device || {};
    if (d.wifiMac && d.wifiMac !== saved(tv).mac) remember(tv, { mac: d.wifiMac });
    return { power: d.PowerState || 'on', model: d.modelName || d.model || null, frame: d.FrameTVSupport === 'true' };
  } catch { return null; }
}

function wake(tv) {
  const mac = saved(tv).mac || process.env[`FRAME_TV_MAC_${tv.id.toUpperCase().replace(/-/g, '_')}`];
  if (!mac) throw new Error('MAC address unknown: turn the TV on once so Sentinel can learn it');
  const bytes = Buffer.from(mac.replace(/[^0-9a-f]/gi, ''), 'hex');
  if (bytes.length !== 6) throw new Error(`bad MAC "${mac}"`);
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(bytes)]);
  const { wolAddr, wolPort } = opt();
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', (e) => { sock.close(); reject(e); });
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(packet, wolPort, wolAddr, (e) => { sock.close(); e ? reject(e) : resolve(); });
    });
  });
}

async function waitFor(tv, test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const i = await info(tv);
    if (test(i)) return i;
    await delay(1000);
  }
  return info(tv);
}

async function status(tv) {
  const i = await info(tv);
  const base = { id: tv.id, name: tv.name, host: tv.host, paired: isPaired(tv), needsApproval: Boolean(needsApproval[tv.id]) };
  if (!i) return { ...base, reachable: false, power: 'off', artMode: null, model: null };
  let artMode = null;
  if (i.power === 'on' && base.paired) { try { artMode = await getArtMode(tv); } catch { /* older firmware, or now needs approval */ } }
  // Re-read: the art check above is what discovers a TV that wants approval again
  return { ...base, paired: isPaired(tv), needsApproval: Boolean(needsApproval[tv.id]), reachable: true, power: i.power, artMode, model: i.model };
}

async function powerOn(tv) {
  let i = await info(tv);
  if (i?.power === 'on') return 'already on';
  await wake(tv);
  i = await waitFor(tv, (x) => x?.power === 'on', opt().bootMs);
  if (i?.power !== 'on' && i) { await sendKey(tv, 'KEY_POWER'); i = await waitFor(tv, (x) => x?.power === 'on', 5000); }
  if (i?.power !== 'on') throw new Error("didn't wake (is Power On with Mobile enabled?)");
  return 'on';
}

async function powerOff(tv) {
  const i = await info(tv);
  if (!i || i.power !== 'on') return 'already off';
  await sendKey(tv, 'KEY_POWER', { hold: 3000 });
  return 'off';
}

// Scene/rule/Game Day entry point. Art mode only wakes a TV that's off when power:true
// is also asked for, so "Goodnight" at 11:30 PM doesn't light up a TV that's already off.
// Once power:true has succeeded the TV is known to be on: no second status check, which
// could time out and wrongly skip the steps after it.
async function applyOne(tv, { power, artMode, app, mute, home }) {
  const did = [];
  if (power === false) { did.push(await powerOff(tv)); return did; }
  let on = false;
  if (power === true) { did.push(await powerOn(tv)); on = true; }
  else on = (await info(tv))?.power === 'on';
  if (!on) {
    if (artMode !== undefined || app || mute !== undefined || home) did.push('off, left alone');
    return did;
  }
  if (artMode !== undefined) {
    try { did.push(await ensureArtMode(tv, artMode)); }
    catch (err) { did.push(`art mode: ${err.message}`); }      // keep going: the app/mute still matter
  }
  if (app) {
    if (artMode === false) await delay(opt().settleMs);     // let it leave art mode first
    try { did.push(`opened ${await launchApp(tv, app)}`); }
    catch (err) { did.push(`app error: ${err.message}`); await sendKey(tv, 'KEY_HOME'); did.push('home screen'); }
  } else if (home) { await delay(opt().settleMs); await sendKey(tv, 'KEY_HOME'); did.push('home screen'); }
  if (mute !== undefined) did.push(await setMute(tv, mute));
  return did;
}

async function apply(opts) {
  const tvs = configured();
  if (!tvs.length) return 'TV: none configured (FRAME_TVS)';
  const out = [];
  for (const tv of tvs) {                // sequential: one TV's prompt/timeout shouldn't tangle another's
    try { out.push(`TV ${tv.name}: ${(await applyOne(tv, opts)).join(', ') || 'nothing to do'}`); }
    catch (err) { out.push(`TV ${tv.name}: error: ${err.message}`); }
  }
  return out.join('; ');
}

// Keys the panel is allowed to send.
const KEYS = ['KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_HOME', 'KEY_RETURN', 'KEY_SOURCE', 'KEY_HDMI',
  'KEY_PLAY', 'KEY_PAUSE', 'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER'];

const _resetApproval = () => { for (const k of Object.keys(needsApproval)) delete needsApproval[k]; };

module.exports = { _resetApproval, configured, find, status, pair, sendKey, getArtMode, setArtMode, ensureArtMode, powerOn, powerOff, apply, wake, getApps, launchApp, setMute, KNOWN_APPS, KEYS };
