// Presence (fake tailscale CLI), ntfy notifications, downtime report, Bambu state, routes.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { mockModules, tempStores, startApp } = require('./helpers');

const dir = tempStores();
for (const k of ['ACTIVITY', 'SCENES', 'RULES', 'HEARTBEAT']) process.env[`${k}_STORE_PATH`] = path.join(dir, `${k.toLowerCase()}.json`);
Object.assign(process.env, { NTFY_TOPIC: 'sentinel-test', NTFY_URL: 'https://ntfy.example', PRESENCE_DEVICES: 'Josh@josh-iphone' });
delete process.env.HOME_LAT; delete process.env.HOME_LON; delete process.env.FRAME_TVS;

// Fake tailscale: prints whatever is in $dir/ts-out
const fake = path.join(dir, 'tailscale');
fs.writeFileSync(fake, `#!/bin/sh\ncat "${dir}/ts-out"\n`, { mode: 0o755 });
process.env.TAILSCALE_BIN = fake;
const tsSays = (text) => fs.writeFileSync(path.join(dir, 'ts-out'), text);

const pushes = [];
const sceneCalls = [];
mockModules({ axios: {
  post: async (url, body) => { if (url.startsWith('https://ntfy.example')) pushes.push(body); return { data: {} }; },
  get: async () => ({ data: { data: { devices: [] } } }),
  put: async (url) => { sceneCalls.push(url); return { data: {} }; },
} });

const notify = require('../lib/notify');
const presence = require('../lib/presence');
const rules = require('../lib/rules');
const bambu = require('../lib/bambu');
const { downtimeReport } = require('../lib/uptime');
const activity = require('../lib/activity');
const quiet = () => { const o = [console.log, console.warn]; console.log = console.warn = () => {}; return () => { [console.log, console.warn] = o; }; };

test('ntfy: JSON publish to the topic; muted categories and missing topic are skipped', async () => {
  pushes.length = 0;
  assert.deepEqual(await notify.notify({ title: 'Hi', category: 'test', tags: ['bat'] }), { sent: true });
  assert.equal(pushes[0].topic, 'sentinel-test');
  assert.equal(pushes[0].title, 'Hi');
  process.env.NTFY_MUTE = 'presence';
  assert.equal((await notify.notify({ title: 'x', category: 'presence' })).sent, false);
  delete process.env.NTFY_MUTE;
  const t = process.env.NTFY_TOPIC; delete process.env.NTFY_TOPIC;
  assert.equal((await notify.notify({ title: 'x' })).reason, 'NTFY_TOPIC not set');
  process.env.NTFY_TOPIC = t;
});

test('presence: path classification', () => {
  assert.equal(presence.classify('pong from josh-iphone (100.1.2.3) via 10.0.0.12:41641 in 20ms'), 'home');
  assert.equal(presence.classify('pong from josh-iphone (100.1.2.3) via 192.168.1.5:41641 in 20ms'), 'home');
  assert.equal(presence.classify('pong from josh-iphone (100.1.2.3) via DERP(ord) in 80ms'), 'away');
  assert.equal(presence.classify('pong from josh-iphone (100.1.2.3) via 172.58.10.2:41641 in 60ms'), 'away', 'carrier IP, not LAN');
  assert.equal(presence.classify('pong ... via DERP(ord) in 80ms\npong from josh-iphone (100.1.2.3) via 10.0.0.12:41641 in 9ms'), 'home',
    'judged on the last pong (relay first, then direct)');
  assert.equal(presence.classify('timeout waiting for ping reply'), 'unreachable');
});

test('presence: restart sighting is not an arrival; leave needs 10 quiet minutes; arrive after away', () => {
  presence._reset();
  const p = presence.people()[0];
  const t0 = Date.now();
  assert.equal(presence.observe(p, 'home', t0), null, 'first sighting after restart');
  assert.equal(presence.observe(p, 'unreachable', t0 + 5 * 60000), null, 'napping phone, not gone');
  assert.equal(presence.observe(p, 'away', t0 + 9 * 60000), null);
  assert.equal(presence.observe(p, 'away', t0 + 11 * 60000), 'leave');
  assert.equal(presence.observe(p, 'away', t0 + 30 * 60000), null);
  assert.equal(presence.observe(p, 'home', t0 + 60 * 60000), 'arrive');
  // Nov 11: right after a restart, one relayed ping must not make the next direct one an "arrival"
  presence._reset();
  const t1 = t0 + 2 * 3600_000;
  assert.equal(presence.observe(p, 'away', t1), null);
  assert.equal(presence.observe(p, 'home', t1 + 60000), null, 'a napping phone after a deploy is not a homecoming');
  presence._reset();
  for (const m of [0, 1, 2]) assert.equal(presence.observe(p, 'away', t1 + m * 60000), null);
  assert.equal(presence.observe(p, 'home', t1 + 3 * 60000), 'arrive', 'three away readings in a row: a real arrival');
});

test('presence -> rules: arrive after dark fires the scene once; daytime and cooldown block it', async () => {
  const restore = quiet();
  try {
    presence._reset();
    rules.setEnabled('arrive-after-dark', true);
    const person = presence.people()[0];
    const night = new Date(2026, 10, 6, 19, 0);
    assert.deepEqual(await rules.handlePresence({ event: 'arrive', person }, new Date(2026, 10, 6, 13, 0)), [], 'daytime');
    assert.deepEqual(await rules.handlePresence({ event: 'arrive', person }, night), ['arrive-after-dark']);
    assert.deepEqual(await rules.handlePresence({ event: 'arrive', person }, new Date(night.getTime() + 60000)), [], 'cooldown');
    rules.setEnabled('everyone-left', true);
    assert.deepEqual(await rules.handlePresence({ event: 'leave', person, everyoneGone: false }, night), []);
    assert.deepEqual(await rules.handlePresence({ event: 'leave', person, everyoneGone: true }, night), ['everyone-left']);
  } finally { restore(); }
});

test('presence: check() runs the CLI, logs the leave and pushes it', async () => {
  const restore = quiet();
  try {
    presence._reset(); pushes.length = 0;
    const events = [];
    tsSays('pong from josh-iphone (100.1.2.3) via 10.0.0.12:41641 in 9ms');
    presence.start({ onEvent: async (e) => events.push(e), intervalMs: 3600_000 });
    const t0 = Date.now();
    await presence.check(t0);
    assert.equal(presence.snapshot()[0].status, 'home');
    tsSays('pong from josh-iphone (100.1.2.3) via DERP(ord) in 90ms');
    await presence.check(t0 + 11 * 60000);
    assert.equal(presence.snapshot()[0].status, 'away');
    assert.equal(events.at(-1).event, 'leave');
    assert.equal(events.at(-1).everyoneGone, true);
    assert.match(activity.list(5).map((e) => e.title).join('|'), /Josh left home/);
    assert.ok(pushes.some((p) => p.title === 'Josh left home'));
  } finally { restore(); }
});

test('rules list picks up new default rules on an existing install', () => {
  assert.ok(rules.list().some((r) => r.id === 'everyone-left'));
  assert.match(rules.describeTrigger(rules.get('arrive-after-dark')), /gets home, after dark/);
});

test('uptime: a long gap reports downtime, a short one does not', () => {
  const now = Date.now();
  assert.equal(downtimeReport({ at: now - 60_000 }, now), null);
  assert.match(downtimeReport({ at: now - 2 * 3600_000 }, now).title, /back after 2h 0m/);
  assert.match(downtimeReport({ at: now - 600_000, crashed: 'boom' }, now).message, /crashed \(boom\)/);
});

test('bambu: merges partial reports; FINISH after RUNNING pushes once', () => {
  const restore = quiet();
  try {
    bambu._reset(); pushes.length = 0;
    assert.equal(bambu.ingest({ print: { gcode_state: 'FINISH' } }), null, 'startup state is not a transition');
    assert.equal(bambu.ingest({ print: { gcode_state: 'RUNNING', subtask_name: 'pi_tray', mc_percent: 10, mc_remaining_time: 95 } }), null);
    bambu.ingest({ print: { mc_percent: 55 } });                       // partial update keeps the rest
    const snap = bambu.snapshot();
    assert.equal(snap.job, 'pi_tray'); assert.equal(snap.percent, 55); assert.equal(snap.active, true);
    assert.ok(snap.finishAt);
    const outcome = bambu.ingest({ print: { gcode_state: 'FINISH', mc_percent: 100 } });
    assert.equal(outcome, 'finished');
    bambu.announce(outcome);
    assert.equal(pushes.at(-1).title, 'Print done: pi_tray');
    assert.equal(bambu.ingest({ print: { gcode_state: 'FINISH' } }), null, 'no repeat');
    bambu.ingest({ print: { gcode_state: 'RUNNING' } });
    assert.equal(bambu.ingest({ print: { gcode_state: 'FAILED' } }), 'failed');
  } finally { restore(); }
});

test('HTTP: presence, printer, notify', async (t) => {
  const app = await startApp(require('../routes/home'));
  t.after(app.close);
  const p = await app.call('GET', '/api/presence');
  assert.equal(p.body.configured, true);
  assert.equal(p.body.people[0].name, 'Josh');
  const pr = await app.call('GET', '/api/printer');
  assert.equal(pr.body.configured, false);
  const n = await app.call('GET', '/api/notify');
  assert.equal(n.body.configured, true);
  assert.equal(JSON.stringify(n.body).includes('sentinel-test'), false, 'topic is never exposed');
  assert.equal((await app.call('POST', '/api/notify/test')).status, 200);
});
