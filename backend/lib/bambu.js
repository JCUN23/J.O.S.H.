// Bambu Lab printer (P2S, P1, X1, A1) over its local MQTT API: live state, progress, time
// remaining, temps, and a push when a print finishes or fails. Read-only, so it works in
// normal cloud mode: no LAN-only mode or developer mode, Bambu Handy keeps working.
//   BAMBU_HOST=10.0.0.x  BAMBU_SERIAL=<printer SN>  BAMBU_ACCESS_CODE=<LAN access code>
// The printer speaks MQTT over TLS on 8883 (user "bblp") with a self-signed cert.
// P-series printers send only changed fields, so reports are merged into one state.
const activity = require('./activity');
const { notify } = require('./notify');

const ACTIVE = ['PREPARE', 'RUNNING', 'PAUSE', 'SLICING'];
const PUSHALL_MS = 5 * 60 * 1000;      // Bambu: full refresh no more than every ~5 min

const cfg = () => ({ host: process.env.BAMBU_HOST, serial: process.env.BAMBU_SERIAL,
  code: process.env.BAMBU_ACCESS_CODE, name: process.env.BAMBU_NAME || 'Bambu P2S',
  port: Number(process.env.BAMBU_PORT) || 8883, protocol: process.env.BAMBU_PROTOCOL || 'mqtts' });
const configured = () => { const c = cfg(); return Boolean(c.host && c.serial && c.code); };

const s = { connected: false, error: null, print: {}, updatedAt: null, lastJob: null };
let client = null;

const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

// Merge one report. Exported for tests. Returns 'finished' | 'failed' | null.
function ingest(msg, now = Date.now()) {
  const p = msg?.print;
  if (!p || typeof p !== 'object') return null;
  const before = s.print.gcode_state;
  Object.assign(s.print, p);
  s.updatedAt = now;
  const after = s.print.gcode_state;
  if (ACTIVE.includes(after)) s.lastJob = { name: s.print.subtask_name || s.lastJob?.name, startedAt: s.lastJob?.startedAt || now };
  if (!ACTIVE.includes(before) || before === after) return null;      // only a real transition counts
  if (after === 'FINISH') return 'finished';
  if (after === 'FAILED') return 'failed';
  return null;
}

function announce(outcome) {
  const job = s.print.subtask_name || s.lastJob?.name || 'print';
  const took = s.lastJob?.startedAt ? ` after ${duration(Math.round((Date.now() - s.lastJob.startedAt) / 60000))}` : '';
  const title = outcome === 'finished' ? `Print done: ${job}` : `Print failed: ${job}`;
  const detail = outcome === 'finished' ? `Finished${took}.` : `Stopped at ${s.print.mc_percent ?? '?'}%${took}. Check the printer.`;
  activity.log({ source: 'printer', title, results: [outcome === 'finished' ? `printer: ${detail}` : `error: ${detail}`] });
  notify({ title, message: detail, category: 'print', priority: outcome === 'finished' ? 4 : 5,
    tags: [outcome === 'finished' ? 'white_check_mark' : 'x'] });
  s.lastJob = null;
}

function snapshot() {
  const p = s.print;
  const c = cfg();
  const remaining = Number.isFinite(p.mc_remaining_time) ? p.mc_remaining_time : null;
  const state = p.gcode_state || null;
  return {
    configured: configured(), name: c.name, connected: s.connected, error: s.error,
    state, active: ACTIVE.includes(state), job: p.subtask_name || null,
    percent: Number.isFinite(p.mc_percent) ? p.mc_percent : null,
    remainingMin: remaining,
    finishAt: remaining != null && ACTIVE.includes(state) ? new Date((s.updatedAt || Date.now()) + remaining * 60000).toISOString() : null,
    layer: p.layer_num ?? null, totalLayers: p.total_layer_num ?? null,
    nozzle: p.nozzle_temper ?? null, nozzleTarget: p.nozzle_target_temper ?? null,
    bed: p.bed_temper ?? null, bedTarget: p.bed_target_temper ?? null,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  };
}

function start() {
  if (client || !configured()) return false;
  const c = cfg();
  const mqtt = require('mqtt');           // loaded only when a printer is configured
  client = mqtt.connect(`${c.protocol}://${c.host}:${c.port}`, {
    username: 'bblp', password: c.code, rejectUnauthorized: false,   // printer cert is self-signed
    reconnectPeriod: 15000, connectTimeout: 10000, clientId: `sentinel-${Math.random().toString(16).slice(2, 8)}`,
  });
  const pushall = () => client.connected && client.publish(`device/${c.serial}/request`,
    JSON.stringify({ pushing: { sequence_id: String(Date.now()), command: 'pushall', version: 1, push_target: 1 } }));
  client.on('connect', () => {
    s.connected = true; s.error = null;
    client.subscribe(`device/${c.serial}/report`, () => pushall());
  });
  client.on('message', (_topic, buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
    const outcome = ingest(msg);
    if (outcome) announce(outcome);
  });
  client.on('error', (err) => {
    s.error = /Not authorized|Bad username/i.test(err.message) ? 'printer rejected the access code' : err.message;
  });
  client.on('close', () => { s.connected = false; });
  setInterval(pushall, PUSHALL_MS).unref();
  console.log(`Bambu: watching ${c.name} at ${c.host}`);
  return true;
}

const stop = () => new Promise((r) => (client ? client.end(true, {}, r) : r()));
const _reset = () => { s.print = {}; s.lastJob = null; s.updatedAt = null; };

module.exports = { configured, start, stop, snapshot, ingest, announce, _reset };
