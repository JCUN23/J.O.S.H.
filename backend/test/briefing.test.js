// Alfred's briefings: what's said, morning once a day, welcome home only after arriving.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tempStores } = require('./helpers');

const dir = tempStores();
process.env.BRIEFING_STORE_PATH = path.join(dir, 'briefing.json');
const briefing = require('../lib/briefing');

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m);
const sources = {
  weather: async () => 'Currently 54 degrees and clear. Feels like 48. High of 58, low of 40.',
  calendar: async () => 'Today: Chiro (5:15 PM).',
  sports: async () => 'Today: Detroit Pistons: Lakers at Pistons, today 6:00 PM on FanDuel SN DET',
  reminders: async () => [{ kind: 'reminder', label: 'call Mom', dueAt: at(9, 17).getTime() }, { kind: 'timer', label: 'pasta', dueAt: at(9, 9).getTime() }],
};

test('one short rundown: weather, calendar, games, today\'s reminders', async () => {
  const text = await briefing.compose('morning', { now: at(9, 8), sources });
  assert.equal(text, "Good morning, Josh. It's 54 degrees and clear. High of 58, low of 40. On the calendar: Chiro (5:15 PM). "
    + 'Games: Detroit Pistons: Lakers at Pistons, 6:00 PM on FanDuel SN DET Reminders: 5:00 PM call Mom.');
});

test('a broken or slow source is skipped, not read out', async () => {
  const text = await briefing.compose('ask', { now: at(9, 19), sources: { ...sources,
    weather: async () => 'Weather needs HOME_LAT and HOME_LON in backend/.env.',
    calendar: async () => { throw new Error('boom'); },
    sports: async () => "None of Josh's teams (...) play today.",
    reminders: async () => [],
  } });
  assert.equal(text, 'Good evening, Josh. None of your teams play today.');
});

test('morning: the first sighting between 5 AM and noon, once a day', async () => {
  briefing._reset();
  assert.deepEqual(await briefing.onArrived({ now: at(9, 4, 30), sources }), { skip: 'already briefed / not morning' });
  assert.match((await briefing.onArrived({ now: at(9, 8), sources })).text, /^Good morning, Josh\./);
  assert.ok((await briefing.onArrived({ now: at(9, 9), sources })).skip, 'not twice the same morning');
  assert.match((await briefing.onArrived({ now: at(10, 7), sources })).text, /^Good morning/, 'next day again');
});

test('welcome home: the first sighting within 2 hours of getting home, once', async () => {
  briefing._reset();
  briefing.onPresence({ event: 'arrive' }, at(9, 17).getTime());
  assert.match((await briefing.onArrived({ now: at(9, 17, 20), sources })).text, /^Welcome home, Josh\./);
  assert.ok((await briefing.onArrived({ now: at(9, 17, 30), sources })).skip);
  briefing.onPresence({ event: 'arrive' }, at(9, 18).getTime());
  assert.ok((await briefing.onArrived({ now: at(9, 21), sources })).skip, 'too long after arriving');
});

test('never two unprompted briefings within 2 hours, whatever triggers them (Nov 11)', async () => {
  briefing._reset();
  assert.match((await briefing.onArrived({ now: at(12, 9), sources })).text, /^Good morning/);
  briefing.onPresence({ event: 'arrive' }, at(12, 10).getTime());     // a fake "arrival" after a deploy
  assert.deepEqual(await briefing.onArrived({ now: at(12, 10, 5), sources }), { skip: 'briefed 65 min ago' });
  briefing.onPresence({ event: 'arrive' }, at(12, 13).getTime());     // a real one, later
  assert.match((await briefing.onArrived({ now: at(12, 13, 10), sources })).text, /^Welcome home/);
});
