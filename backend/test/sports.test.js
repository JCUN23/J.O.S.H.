// Sentinel's sports answers: right date, real times, followed teams (fake ESPN feeds).
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const sports = require('../lib/sports');

const now = new Date(2026, 10, 8, 12, 40);                  // Sun Nov 8 2026, 12:40 PM
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const team = (n, ha, sc) => ({ homeAway: ha, team: { shortDisplayName: n }, score: sc === undefined ? undefined : { displayValue: String(sc) } });
const ev = (id, date, state, away, home, extra = {}) => ({ id, date, competitions: [{ status: { type: { state, shortDetail: extra.detail || '' } },
  competitors: [team(away[0], 'away', away[1]), team(home[0], 'home', home[1])], broadcasts: extra.tv ? [{ media: { shortName: extra.tv } }] : [] }] });

const FEEDS = {
  '/football/nfl/teams/8/schedule': { events: [
    ev('L0', at(2, 13), 'post', ['Lions', 24], ['Vikings', 17]),
    ev('L1', at(8, 13), 'in', ['Packers', 10], ['Lions', 14], { detail: '2nd 4:12' }),
  ] },
  '/basketball/nba/teams/8/schedule': { events: [
    ev('P1', at(9, 19, 30), 'pre', ['Pistons'], ['Bucks'], { tv: 'FanDuel SN DET' }),
  ] },
  '/football/college-football/teams/130/schedule': { events: [] },
  '/basketball/mens-college-basketball/teams/130/schedule': { events: [
    ev('M0', at(6, 20), 'post', ['UConn', 70], ['Michigan', 75]),
    ev('M1', at(11, 19), 'pre', ['Oakland'], ['Michigan'], { tv: 'BTN' }),
  ] },
  '/soccer/esp.1/teams/83/schedule': { events: [ev('B1', at(8, 15), 'pre', ['Barcelona'], ['Sevilla'], { tv: 'ESPN+' })] },
  '/basketball/nba/scoreboard': { events: [
    ev('N1', at(8, 15, 30), 'pre', ['Celtics'], ['Knicks'], { tv: 'ABC' }),
    ev('N2', at(7, 20), 'post', ['Heat', 99], ['Bulls', 98]),        // yesterday: must not appear
  ] },
};
const fetchImpl = async (url) => {
  const path = new URL(url).pathname.replace('/apis/site/v2/sports', '');
  return FEEDS[path] ? { ok: true, json: async () => FEEDS[path] } : { ok: false, status: 404 };
};
const ask = (q) => sports.answer(q, { now, fetchImpl });

test('"what games are on today": followed teams only, today only, real time + network', async () => {
  sports._clearCache();
  const r = await ask('what games are on today');
  assert.match(r, /Detroit Lions: LIVE: Packers 10, Lions 14 \(2nd 4:12\)/);
  assert.match(r, /FC Barcelona: Barcelona at Sevilla, today 3:00 PM on ESPN\+/);
  assert.doesNotMatch(r, /Pistons|Michigan|Vikings/, 'tomorrow/other days excluded');
});

test('a team: today, else next game and last result', async () => {
  assert.match(await ask('Pistons'), /Detroit Pistons don't play today\. Next: Pistons at Bucks, tomorrow 7:30 PM on FanDuel SN DET\./);
  const mich = await ask('when does michigan play');
  assert.match(mich, /Next: Oakland at Michigan, Wednesday, Nov 11 7:00 PM on BTN\./);
  assert.match(mich, /Last: Final: UConn 70, Michigan 75\./);
});

test('a league: only games on today\'s date', async () => {
  const r = await ask('NBA games tonight');
  assert.match(r, /NBA today \(1\): Celtics at Knicks, today 3:30 PM on ABC/);
  assert.doesNotMatch(r, /Heat/);
});

test('ESPN down: says so and tells the model not to guess', async () => {
  sports._clearCache();
  const r = await sports.answer('NFL', { now, fetchImpl: async () => { throw new Error('offline'); } });
  assert.match(r, /Couldn't reach ESPN.*Don't guess/);
});

test('games missing from a team schedule are found on the league scoreboards (Nov 8: missed games)', async () => {
  sports._clearCache();
  const withIds = (e, awayId, homeId) => { const [a, h] = e.competitions[0].competitors; a.team.id = awayId; h.team.id = homeId; return e; };
  // Pistons vs Lakers tonight: on the NBA scoreboard, not in the Pistons' schedule feed
  FEEDS['/basketball/nba/scoreboard'].events.push(withIds(ev('N3', at(8, 18), 'pre', ['Lakers'], ['Pistons'], { tv: 'FanDuel SN DET' }), '13', '8'));
  // Barça in the Champions League: soccer team schedules only cover their own league
  FEEDS['/soccer/uefa.champions/scoreboard'] = { events: [withIds(ev('U1', at(8, 12), 'post', ['Barcelona', 2], ['Inter', 1]), '83', '110')] };
  const r = await ask('what games are on today');
  assert.match(r, /Detroit Pistons: Lakers at Pistons, today 6:00 PM on FanDuel SN DET/);
  assert.match(r, /FC Barcelona: Final: Barcelona 2, Inter 1/);
  assert.match(r, /FC Barcelona: Barcelona at Sevilla/, 'the schedule game is still there, once');
  assert.equal((r.match(/Packers 10, Lions 14/g) || []).length, 1);
  delete FEEDS['/soccer/uefa.champions/scoreboard'];
  FEEDS['/basketball/nba/scoreboard'].events.pop();
});
