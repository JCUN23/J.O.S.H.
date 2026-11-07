const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores, startApp } = require('./helpers');

const dir = tempStores();
process.env.GAMEDAY_STORE_PATH = path.join(dir, 'gameday.json');
Object.assign(process.env, { GOVEE_API_KEY: 'k', HUE_BRIDGE_IP: '10.0.0.2', HUE_USERNAME: 'u', SMARTTHINGS_TOKEN: 'PAT' });

const sent = { govee: [], hue: [], tv: [] };
let goveeDown = false;
mockModules({ axios: {
  get: async (url) => {
    if (url.includes('govee')) {
      if (goveeDown) throw new Error('govee down');
      return { data: { data: { devices: [
        { device: 'rope', model: 'H61A2', supportCmds: ['turn', 'color'] },
        { device: 'plug', model: 'H5086', supportCmds: ['turn'] },
        { device: 'lr', model: 'H6076', supportCmds: ['turn', 'color'] },
        { device: 'neon', model: 'H61D5', supportCmds: ['turn', 'color'] },
      ] } } };
    }
    return { data: { items: [{ deviceId: 'tv1', label: 'Frame TV', components: [{ capabilities: [{ id: 'samsungvd.mediaInputSource' }] }] }] } };
  },
  put: async (url, body) => {
    if (url.includes('govee')) sent.govee.push(body);
    else sent.hue.push({ url, body });
    return { data: { code: 200 } };
  },
  post: async (url, body) => { sent.tv.push(body.commands[0].command); return { data: {} }; },
} });

const { findTeam, TEAMS } = require('../lib/teams');
const gameDay = require('../lib/gameDay');

const schedule = (state, id = 'evt1') => ({ events: [{ id, competitions: [{ status: { type: { state } } }] }] });
const ok = (body) => ({ ok: true, json: async () => body });
const quiet = () => { const o = [console.log, console.warn]; console.log = console.warn = () => {}; return () => { [console.log, console.warn] = o; }; };

test('findTeam resolves names and aliases', () => {
  assert.equal(findTeam('Lions').name, 'Detroit Lions');
  assert.equal(findTeam('Detroit Pistons').key, 'pistons');
  assert.equal(findTeam('michigan football').key, 'michigan-football');
  assert.equal(findTeam('barça').key, 'barcelona');
  assert.equal(findTeam('Red Wings'), null);
});

test('activate: colors only reach color-capable lights; Hue gets primary/secondary; TV wakes', async () => {
  const restore = quiet();
  try { await gameDay.activate(findTeam('lions')); } finally { restore(); }
  assert.deepEqual(sent.govee.map((b) => b.device), ['rope', 'neon']);   // no plug, no H6076
  assert.deepEqual(sent.govee[0].cmd.value, findTeam('lions').colors.primary);
  assert.deepEqual(sent.govee[1].cmd.value, findTeam('lions').colors.secondary);
  assert.deepEqual(sent.hue.map((h) => h.url.match(/lights\/(\d+)/)[1]), ['5', '4']);
  assert.deepEqual(sent.tv, ['off', 'on', 'send']);
});

test('one failing integration does not block the others; lightsOnly skips the TV', async () => {
  sent.govee = []; sent.hue = []; sent.tv = []; goveeDown = true;
  const restore = quiet();
  let entry;
  try { entry = await gameDay.activate(findTeam('pistons'), { lightsOnly: true }); } finally { restore(); goveeDown = false; }
  assert.match(entry.results[0], /error: govee down/);
  assert.equal(sent.hue.length, 2);
  assert.equal(sent.tv.length, 0);
});

test('watcher fires once per live game, survives restarts, ignores other states', async () => {
  const acted = [];
  const act = async (team) => acted.push(team.key);
  const lions = TEAMS.find((t) => t.key === 'lions');
  const pistons = TEAMS.find((t) => t.key === 'pistons');
  const fetchFor = (map) => async (url) => {
    if (url === lions.scheduleUrl) return ok(map.lions);
    if (url === pistons.scheduleUrl) { if (map.pistons === 'boom') throw new Error('ESPN timeout'); return ok(map.pistons); }
    return ok(schedule('post'));
  };
  const restore = quiet();
  try {
    // scheduled + finished games: nothing
    assert.deepEqual(await gameDay.checkOnce(fetchFor({ lions: schedule('pre'), pistons: schedule('post', 'p0') }), act), []);
    // Lions go live while the Pistons API errors: Lions still fire
    assert.deepEqual(await gameDay.checkOnce(fetchFor({ lions: schedule('in', 'L1'), pistons: 'boom' }), act), ['Detroit Lions']);
    // next poll, same game still live: no re-fire (regression: every page reload re-fired)
    assert.deepEqual(await gameDay.checkOnce(fetchFor({ lions: schedule('in', 'L1'), pistons: schedule('pre') }), act), []);
    // "restart": reload the module from the same store file -> still no re-fire
    delete require.cache[require.resolve('../lib/gameDay')];
    delete require.cache[require.resolve('../lib/jsonStore')];
    const reloaded = require('../lib/gameDay');
    assert.deepEqual(await reloaded.checkOnce(fetchFor({ lions: schedule('in', 'L1'), pistons: schedule('pre') }), act), []);
    // a new game is a new event id: fires
    assert.deepEqual(await reloaded.checkOnce(fetchFor({ lions: schedule('in', 'L2'), pistons: schedule('pre') }), act), ['Detroit Lions']);
  } finally { restore(); }
  assert.deepEqual(acted, ['lions', 'lions']);
});

test('HTTP: manual trigger + status', async (t) => {
  const app = await startApp(require('../routes/gameday'));
  t.after(app.close);
  const restore = quiet(); t.after(restore);
  assert.equal((await app.call('POST', '/api/game-day', { team: 'Red Wings' })).status, 400);
  const r = await app.call('POST', '/api/game-day', { team: 'Lions', lightsOnly: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.team, 'Detroit Lions');
  const s = await app.call('GET', '/api/game-day/status');
  assert.equal(s.body.last.team, 'Detroit Lions');
  assert.equal(s.body.teams.length, TEAMS.length);
});

test('networksOf reads both ESPN feed shapes, deduped', () => {
  const ev = (broadcasts) => ({ competitions: [{ broadcasts }] });
  assert.deepEqual(gameDay.networksOf(ev([{ media: { shortName: 'TNT' } }, { media: { shortName: 'truTV' } }])), ['TNT', 'truTV']);
  assert.deepEqual(gameDay.networksOf(ev([{ market: 'national', names: ['NBC', 'Peacock'] }, { names: ['Peacock'] }])), ['NBC', 'Peacock']);
  assert.deepEqual(gameDay.networksOf(null), []);
});

test('pickTvApp: per-team override, then network map, then default', () => {
  const lions = findTeam('lions');
  const barca = findTeam('barcelona');
  assert.equal(gameDay.pickTvApp(lions, ['FOX']).app, 'fubo');
  assert.equal(gameDay.pickTvApp(lions, ['NBC', 'Peacock']).app, 'Peacock');
  assert.equal(gameDay.pickTvApp(findTeam('michigan basketball'), ['TNT', 'truTV']).app, 'HBO Max|Max');
  assert.equal(gameDay.pickTvApp(barca, ['ESPN+']).app, 'ESPN');
  assert.match(gameDay.pickTvApp(lions, ['FOX']).why, /game is on FOX/);
  process.env.GAMEDAY_TV_APP_BARCELONA = 'ESPN';
  assert.equal(gameDay.pickTvApp(barca, ['CBS Sports Network']).app, 'ESPN', 'override wins');
  delete process.env.GAMEDAY_TV_APP_BARCELONA;
  assert.equal(gameDay.pickTvApp(lions, []).app, null, 'unknown network, no default: home screen');
  process.env.GAMEDAY_TV_APP = 'fubo';
  assert.equal(gameDay.pickTvApp(lions, []).app, 'fubo');
  delete process.env.GAMEDAY_TV_APP;
  process.env.GAMEDAY_TV_NETWORK_APPS = 'FOX=YouTube TV,*=Sling';
  assert.equal(gameDay.pickTvApp(lions, ['FOX']).app, 'YouTube TV');
  assert.equal(gameDay.pickTvApp(lions, ['CBS']).app, 'Sling');
  delete process.env.GAMEDAY_TV_NETWORK_APPS;
});

test('watcher hands the live event (with its networks) to activate', async () => {
  const restore = quiet();
  try {
    gameDay._state.set('triggered', {});
    const live = { events: [{ id: 'P9', competitions: [{ status: { type: { state: 'in' } }, broadcasts: [{ names: ['Peacock'] }] }] }] };
    const got = [];
    const fetchImpl = async (url) => ok(url.includes('/nba/') ? live : { events: [] });
    await gameDay.checkOnce(fetchImpl, async (team, opts) => got.push([team.key, gameDay.networksOf(opts.event)]));
    assert.deepEqual(got, [['pistons', ['Peacock']]]);
  } finally { restore(); }
});
