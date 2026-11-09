// Live game alerts: a Lions game snapshot by snapshot; basketball only halftime/final.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const sports = require('../lib/sports');
const alerts = require('../lib/gameAlerts');

const now = new Date(2026, 10, 15, 14, 0);
const at = (h, m = 0) => new Date(2026, 10, 15, h, m).toISOString();
const side = (id, name, ha, score) => ({ homeAway: ha, team: { id, shortDisplayName: name }, score: String(score) });
const game = (id, date, state, name, us, them, usId = '8', themId = '9', themName = 'Packers', usName = 'Lions') => ({
  id, date, competitions: [{ status: { type: { state, name } }, competitors: [side(themId, themName, 'away', them), side(usId, usName, 'home', us)] }],
});

let nfl = [];                     // the live NFL scoreboard, changed between ticks
let nba = [];
let fetches = 0;
const fetchImpl = async (url) => {
  fetches++;
  const p = new URL(url).pathname.replace('/apis/site/v2/sports/', '');
  const body = {
    'football/nfl/teams/8/schedule': { events: [game('L1', at(13), 'pre', 'STATUS_SCHEDULED', 0, 0)] },
    'football/nfl/scoreboard': { events: nfl },
    'basketball/nba/teams/8/schedule': { events: [game('P1', at(13, 30), 'pre', 'STATUS_SCHEDULED', 0, 0, '8', '13', 'Lakers', 'Pistons')] },
    'basketball/nba/scoreboard': { events: nba },
  }[p] || { events: [] };
  return { ok: true, json: async () => body };
};
const said = [];
const tick = () => alerts.tick(now, { fetchImpl, say: async (t) => said.push(t) });

test('a Lions game: first sight is silent, then scores both ways, halftime, final once', async () => {
  sports._clearCache(); alerts._reset();
  nfl = [game('L1', at(13), 'in', 'STATUS_IN_PROGRESS', 7, 3)];
  assert.deepEqual(await tick(), [], 'already in progress when first seen: no alert');
  nfl = [game('L1', at(13), 'in', 'STATUS_IN_PROGRESS', 14, 3)];
  assert.deepEqual(await tick(), ['Touchdown Lions! Lions 14, Packers 3.']);
  nfl = [game('L1', at(13), 'in', 'STATUS_IN_PROGRESS', 15, 6)];   // extra point alone: silent
  assert.deepEqual(await tick(), ['Packers field goal. Lions 15, Packers 6.']);
  nfl = [game('L1', at(13), 'in', 'STATUS_HALFTIME', 15, 6)];
  assert.deepEqual(await tick(), ['Halftime: Lions 15, Packers 6.']);
  assert.deepEqual(await tick(), [], 'halftime said once');
  nfl = [game('L1', at(13), 'post', 'STATUS_FINAL', 24, 20)];
  assert.deepEqual(await tick(), ['Final: Lions 24, Packers 20. The Lions win!']);
  assert.deepEqual(await tick(), [], 'final said once');
});

test('basketball: no alert per basket, just halftime and the final', async () => {
  alerts._reset(); said.length = 0;
  nfl = [];
  nba = [game('P1', at(13, 30), 'in', 'STATUS_IN_PROGRESS', 20, 18, '8', '13', 'Lakers', 'Pistons')];
  await tick();
  nba = [game('P1', at(13, 30), 'in', 'STATUS_IN_PROGRESS', 41, 39, '8', '13', 'Lakers', 'Pistons')];
  assert.deepEqual(await tick(), []);
  nba = [game('P1', at(13, 30), 'post', 'STATUS_FINAL', 101, 108, '8', '13', 'Lakers', 'Pistons')];
  assert.deepEqual(await tick(), ['Final: Pistons 101, Lakers 108. The Pistons lose.']);
});

test('no game near: no live polling; GAME_ALERTS=off: nothing', async () => {
  sports._clearCache(); alerts._reset();
  const quietDay = new Date(2026, 10, 16, 9, 0);    // nothing today
  fetches = 0;
  await alerts.tick(quietDay, { fetchImpl, say: async () => {} });
  const scheduleOnly = fetches;
  await alerts.tick(quietDay, { fetchImpl, say: async () => {} });
  assert.equal(fetches, scheduleOnly, 'second check served from cache, no scoreboard polling');
  process.env.GAME_ALERTS = 'off';
  assert.deepEqual(await tick(), []);
  delete process.env.GAME_ALERTS;
});
