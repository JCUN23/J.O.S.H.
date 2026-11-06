// Samsung Frame TVs over the local network. No SmartThings cloud, no account, no fees.
//   Remote keys  wss://<ip>:8002/api/v2/channels/samsung.remote.control
//   Art mode     wss://<ip>:8002/api/v2/channels/com.samsung.art-app
//   Device info  http://<ip>:8001/api/v2/            (PowerState, wifiMac, model)
//   Power on     Wake-on-LAN to the TV's MAC          (TV setting: "Power On with Mobile")
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
const isPaired = (tv) => Boolean(saved(tv).token);

// Open a channel and resolve once the TV says it's ready. Without a token the TV shows
// its Allow prompt and holds the connection until you answer, hence the long pair timeout.
function open(tv, channel, { timeoutMs = 8000 } = {}) {
  const { scheme, wsPort } = opt();
  const token = saved(tv).token;
  const url = `${scheme}://${tv.host}:${wsPort}/api/v2/channels/${channel}?name=${APP_NAME}${token ? `&token=${token}` : ''}`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: 5000 }); // TV cert is self-signed
    const done = (err) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(readyFallback);
      if (err) { ws.terminate(); reject(err); } else resolve(ws);
    };
    let readyFallback = null;
    const timer = setTimeout(() => done(new Error(token ? 'TV did not answer'
      : 'not paired yet: press Pair, then choose Allow on the TV')), timeoutMs);
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.event === 'ms.channel.connect') {
        if (msg.data?.token && msg.data.token !== token) remember(tv, { token: msg.data.token, pairedAt: Date.now() });
        if (channel !== ART) done();
        else readyFallback = setTimeout(() => done(), 1500);   // some firmware never sends "ready"
      } else if (msg.event === 'ms.channel.ready') done();
      else if (msg.event === 'ms.channel.unauthorized') {
        done(new Error('TV refused Sentinel. Allow it under Settings > General > External Device Manager > Device Connection Manager'));
      }
    });
    ws.on('error', (err) => done(new Error(`can't reach TV at ${tv.host} (${err.code || err.message})`)));
    ws.on('close', () => done(new Error('TV closed the connection')));
  });
}

const pair = (tv) => open(tv, REMOTE, { timeoutMs: 45000 }).then((ws) => { ws.close(); return isPaired(tv); });

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

const getArtMode = async (tv) => (await artRequest(tv, 'get_artmode_status', {}, { expect: ['artmode_status'] })).value;
const setArtMode = (tv, on) => artRequest(tv, 'set_artmode_status', { value: on ? 'on' : 'off' },
  { expect: ['art_mode_changed', 'artmode_status'] });

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
  const base = { id: tv.id, name: tv.name, host: tv.host, paired: isPaired(tv) };
  if (!i) return { ...base, reachable: false, power: 'off', artMode: null, model: null };
  let artMode = null;
  if (i.power === 'on' && base.paired) { try { artMode = await getArtMode(tv); } catch { /* older firmware */ } }
  return { ...base, reachable: true, power: i.power, artMode, model: i.model };
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

// Scene/rule entry point. Art mode only wakes a TV that's off when power:true is also
// asked for, so "Goodnight" at 11:30 PM doesn't light up a TV that's already off.
async function applyOne(tv, { power, artMode, home }) {
  const did = [];
  if (power === false) { did.push(await powerOff(tv)); return did; }
  if (power === true) did.push(await powerOn(tv));
  if (artMode !== undefined) {
    const i = await info(tv);
    if (i?.power !== 'on') did.push('off, art left alone');
    else { await setArtMode(tv, artMode); did.push(artMode ? 'art mode' : 'art off'); }
  }
  if (home) { await delay(1500); await sendKey(tv, 'KEY_HOME'); did.push('home screen'); }
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

module.exports = { configured, find, status, pair, sendKey, getArtMode, setArtMode, powerOn, powerOff, apply, wake, KEYS };
