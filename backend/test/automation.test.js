process.env.TZ = 'America/Detroit';   // rules and sun times are local-time
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores, startApp } = require('./helpers');

const dir = tempStores();
for (const k of ['ACTIVITY', 'SCENES', 'RULES', 'GAMEDAY']) process.env[`${k}_STORE_PATH`] = path.join(dir, `${k.toLowerCase()}.json`);
Object.assign(process.env, { GOVEE_API_KEY: 'k', HUE_BRIDGE_IP: '10.0.0.2', HUE_USERNAME: 'u', SMARTTHINGS_TOKEN: 'PAT' });
process.env.HUE_LIGHTS = '*';   // scene actions here; the Go-only filter has its own test (hueLights.test.js)
delete process.env.HOME_LAT; delete process.env.HOME_LON;

process.env.GOVEE_GAP_MS = '0';
const sent = { govee: [], hue: [], tv: [] };
let goveeReply = null;   // (body, attempt) => response | throws; default OK
mockModules({ axios: {
  get: async (url) => url.includes('govee')
    ? { data: { data: { devices: [
        { device: 'rope', model: 'H61A2', supportCmds: ['turn', 'brightness', 'color', 'colorTem'] },
        { device: 'plug', model: 'H5086', supportCmds: ['turn'] },
        { device: 'lr', model: 'H6076', supportCmds: ['turn', 'brightness', 'color', 'colorTem'] },
      ] } } }
    : { data: { items: [
        { deviceId: 'tv1', label: 'Frame TV', components: [{ capabilities: [{ id: 'samsungvd.mediaInputSource' }] }] },
        { deviceId: 'fridge', label: 'Fridge', components: [{ capabilities: [] }] },
      ] } },
  put: async (url, body) => {
    (url.includes('govee') ? sent.govee : sent.hue).push(url.includes('govee') ? body : { url, body });
    if (url.includes('govee') && goveeReply) return goveeReply(body);
    return { data: { code: 200 } };
  },
  post: async (url, body) => { sent.tv.push(`${url.match(/devices\/([^/]+)/)[1]}:${body.commands[0].capability}:${body.commands[0].command}`); return { data: {} }; },
} });
const reset = () => { sent.govee = []; sent.hue = []; sent.tv = []; };
const quiet = () => { const o = [console.log, console.warn]; console.log = console.warn = () => {}; return () => { [console.log, console.warn] = o; }; };

const { sunTimes } = require('../lib/sun');
const activity = require('../lib/activity');
const { runActions } = require('../lib/actions');
const scenes = require('../lib/scenes');
const rules = require('../lib/rules');

const minutes = (d) => d.getHours() * 60 + d.getMinutes();

test('sun: Detroit on Nov 5 2026 is within 10 min of published times (7:11 AM / 5:20 PM)', () => {
  const t = sunTimes(new Date(2026, 10, 5, 12), 42.33, -83.05);
  assert.ok(Math.abs(minutes(t.sunrise) - (7 * 60 + 11)) <= 10, t.sunrise.toString());
  assert.ok(Math.abs(minutes(t.sunset) - (17 * 60 + 20)) <= 10, t.sunset.toString());
});

test('activity: newest first, failures flagged, capped', () => {
  activity.log({ title: 'a', results: ['Govee: 2/2 commands ok'] });
  const bad = activity.log({ title: 'b', results: ['Hue: error: timeout'] });
  const [first, second] = activity.list(2);
  assert.equal(first.title, 'b'); assert.equal(second.title, 'a');
  assert.equal(bad.ok, false); assert.equal(second.ok, true);
  for (let i = 0; i < activity.MAX_ENTRIES + 5; i++) activity.log({ title: `x${i}` });
  assert.equal(activity.list(1000).length, activity.MAX_ENTRIES);
});

test('actions: color goes only to color-capable lights, Hue gets all-lights group', async () => {
  reset();
  await runActions([{ type: 'lights', color: { r: 255, g: 140, b: 40 }, brightness: 45 }]);
  assert.deepEqual(sent.govee.map((b) => `${b.device}:${b.cmd.name}`), ['rope:color', 'rope:brightness']); // no plug, no H6076
  assert.match(sent.hue[0].url, /groups\/0\/action$/);
  assert.equal(sent.hue[0].body.on, true); assert.equal(sent.hue[0].body.bri, 114);
});

test('actions: off turns everything off; kelvin maps to colorTem / Hue mireds; TV only targets Frame TVs', async () => {
  reset();
  await runActions([{ type: 'lights', on: false }]);
  assert.deepEqual(sent.govee.map((b) => b.cmd), [{ name: 'turn', value: 'off' }, { name: 'turn', value: 'off' }, { name: 'turn', value: 'off' }]);
  assert.deepEqual(sent.hue[0].body, { on: false });
  reset();
  await runActions([{ type: 'lights', kelvin: 2700 }, { type: 'tv', artMode: true }]);
  assert.deepEqual(sent.govee.map((b) => b.cmd), [{ name: 'colorTem', value: 2700 }]);
  assert.equal(sent.hue[0].body.ct, 370);
  assert.deepEqual(sent.tv, ['tv1:samsungvd.ambient:on']);
});

test('govee: failures name the device and reason; a 429 is retried once', async () => {
  reset();
  const seen = {};
  goveeReply = (body) => {
    seen[body.device] = (seen[body.device] || 0) + 1;
    if (body.device === 'plug') return { data: { code: 400, message: 'device not online' } };
    if (body.device === 'rope' && seen.rope === 1) throw Object.assign(new Error('HTTP 429'), { response: { status: 429, data: {} } });
    return { data: { code: 200 } };
  };
  try {
    const [r] = await runActions([{ type: 'lights', on: false }]);
    assert.equal(seen.rope, 2, 'rate-limited command retried');
    assert.match(r, /^Govee: 2\/3 commands ok \(failed: H5086 turn: device not online \(code 400\)\)$/);
    assert.equal(activity.log({ source: 'test', title: 't', results: [r] }).ok, false, 'partial failure shows red');
  } finally { goveeReply = null; }
});

test('scenes: defaults seeded, found by loose names, activation is logged', async () => {
  assert.ok(scenes.list().some((s) => s.id === 'movie-night'));
  assert.equal(scenes.find('Movie Night').id, 'movie-night');
  assert.equal(scenes.find('movie night').id, 'movie-night');
  assert.equal(scenes.find('goodnight').id, 'goodnight');
  assert.equal(scenes.find('disco inferno'), null);
  const r = await scenes.activate(scenes.find('goodnight'), { source: 'voice' });
  assert.equal(r.scene, 'Goodnight');
  const [entry] = activity.list(1);
  assert.equal(entry.title, 'Scene: Goodnight'); assert.equal(entry.source, 'voice');
});

test('rules: ship disabled, fire once a day inside the window, respect days, skip stale triggers', async () => {
  const restore = quiet();
  try {
    assert.ok(rules.list().every((r) => r.enabled === false), 'seeded disabled');
    const thu = new Date(2026, 10, 5, 23, 31);          // Thursday 11:31 PM
    assert.deepEqual(await rules.tick(thu), [], 'disabled rules never fire');

    rules.setEnabled('weeknight-goodnight', true);       // 23:30 Sun-Thu
    assert.deepEqual(await rules.tick(new Date(2026, 10, 5, 23, 29)), [], 'not yet');
    assert.deepEqual(await rules.tick(thu), ['weeknight-goodnight']);
    assert.deepEqual(await rules.tick(new Date(2026, 10, 5, 23, 35)), [], 'once per day');

    const fri = new Date(2026, 10, 6, 23, 31);            // Friday: not in days
    assert.deepEqual(await rules.tick(fri), []);
    const sunLate = new Date(2026, 10, 8, 23, 50);         // Sunday, 20 min late (backend was down)
    assert.deepEqual(await rules.tick(sunLate), [], 'stale trigger skipped, not fired late');
  } finally { restore(); }
});

test('rules: sunset needs HOME_LAT/LON; with them it fires at sunset', async () => {
  const restore = quiet();
  try {
    rules.setEnabled('sunset-relax', true);
    const r = rules.get('sunset-relax');
    assert.equal(rules.triggerTimeToday(r, new Date(2026, 10, 5, 12)), null);
    assert.match(rules.describeTrigger(r), /HOME_LAT/);
    process.env.HOME_LAT = '42.33'; process.env.HOME_LON = '-83.05';
    const at = rules.triggerTimeToday(r, new Date(2026, 10, 5, 12));
    assert.ok(at && at.getHours() === 17, at?.toString());
    assert.deepEqual(await rules.tick(new Date(at.getTime() + 60_000)), ['sunset-relax']);
  } finally { restore(); delete process.env.HOME_LAT; delete process.env.HOME_LON; }
});

test('rules: a trigger missed while the host slept is logged, not silently skipped', async () => {
  const restore = quiet();
  try {
    rules.setEnabled('weekday-focus', true);              // 08:30 Mon-Fri
    const mon = (h, m) => new Date(2026, 10, 9, h, m);
    assert.deepEqual(await rules.tick(mon(8, 29), { since: mon(8, 28) }), []);
    // laptop sleeps through 8:30, wakes at 10:53 (what happened Nov 6)
    assert.deepEqual(await rules.tick(mon(10, 53), { since: mon(8, 29) }), [], 'not fired 2h late');
    const [skip, pause] = activity.list(2);
    assert.match(skip.title, /Skipped: Focus/);
    assert.equal(skip.ok, false, 'shows up red in the activity log');
    assert.match(pause.title, /Scheduler paused for 2h 24m/);
    const before = activity.list(200).length;
    await rules.tick(mon(10, 54), { since: mon(10, 53) });
    assert.equal(activity.list(200).length, before, 'skip is reported once');

    // enabled after its time with no scheduler gap: nothing to report
    const tue = (h, m) => new Date(2026, 10, 10, h, m);
    await rules.tick(tue(10, 0), { since: tue(9, 59) });
    assert.equal(activity.list(200).length, before);
  } finally { restore(); rules.setEnabled('weekday-focus', false); }
});

test('HTTP: scenes, rules, activity', async (t) => {
  const app = await startApp(require('../routes/automation'));
  t.after(app.close);
  const restore = quiet(); t.after(restore);
  assert.ok((await app.call('GET', '/api/scenes')).body.scenes.length >= 5);
  assert.equal((await app.call('POST', '/api/scenes/disco/activate')).status, 404);
  assert.equal((await app.call('POST', '/api/scenes/relax/activate')).body.scene, 'Relax');
  const rl = await app.call('GET', '/api/rules');
  assert.ok(rl.body.rules.every((r) => typeof r.when === 'string'));
  assert.equal((await app.call('PATCH', '/api/rules/weekday-focus', { enabled: 'yes' })).status, 400);
  assert.equal((await app.call('PATCH', '/api/rules/weekday-focus', { enabled: true })).body.rule.enabled, true);
  assert.equal((await app.call('POST', '/api/rules/nope/run')).status, 404);
  assert.equal((await app.call('POST', '/api/rules/weekday-focus/run')).status, 200);
  const act = await app.call('GET', '/api/activity?limit=3');
  assert.equal(act.body.entries.length, 3);
  assert.match(act.body.entries[0].detail, /manually/);
});
