// Timers and reminders: set, list, fire once (late ones marked), cancel, survive a restart.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tempStores } = require('./helpers');

const dir = tempStores();
process.env.TIMERS_STORE_PATH = path.join(dir, 'timers.json');
const timers = require('../lib/timers');

const t0 = new Date(2026, 10, 9, 15, 0).getTime();     // Mon Nov 9, 3:00 PM
const said = [];
const announcer = async (t, text) => said.push(text);

test('parseAt: clock times today, or tomorrow once passed; full dates', () => {
  const d = (ms) => new Date(ms).toString().slice(0, 21);
  assert.equal(d(timers.parseAt('17:00', t0)), 'Mon Nov 09 2026 17:00');
  assert.equal(d(timers.parseAt('5:30 pm', t0)), 'Mon Nov 09 2026 17:30');
  assert.equal(d(timers.parseAt('9am', t0)), 'Tue Nov 10 2026 09:00');
  assert.equal(d(timers.parseAt('12 am', t0)), 'Tue Nov 10 2026 00:00');
  assert.equal(d(timers.parseAt('2026-11-12 08:15', t0)), 'Thu Nov 12 2026 08:15');
  assert.equal(timers.parseAt('soonish', t0), null);
});

test('a timer: set, time left, fires exactly once, then gone', async () => {
  assert.equal(timers.setTimer({ minutes: 10, label: 'pasta' }, t0), 'Timer set for 10 minutes (pasta).');
  assert.equal(timers.describe(t0 + 4 * 60_000), 'Timer (pasta): 6 minutes left.');
  assert.deepEqual(await timers.tick(t0 + 9 * 60_000, announcer), []);
  const fired = await timers.tick(t0 + 10 * 60_000 + 3000, announcer);
  assert.equal(fired.length, 1);
  assert.deepEqual(said, ['Your pasta timer finished.']);
  assert.deepEqual(await timers.tick(t0 + 11 * 60_000, announcer), []);
  assert.equal(timers.describe(t0), 'No timers or reminders running.');
});

test('a reminder: confirmation says when; one missed while offline is still delivered, marked late', async () => {
  said.length = 0;
  assert.equal(timers.setReminder({ text: 'call Mom', at: '5pm' }, t0), "I'll remind Josh today at 5:00 PM: call Mom.");
  assert.match(timers.setReminder({ text: 'trash night', in_minutes: 24 * 60 }, t0), /Tuesday at 3:00 PM: trash night/);
  await timers.tick(t0 + 2 * 3600_000 + 10 * 60_000, announcer);          // server was down at 5:00, back 5:10
  assert.deepEqual(said, ['Missed while I was offline: a reminder, Josh: call Mom.']);
  assert.match(timers.setReminder({ text: 'x', at: 'whenever' }, t0), /couldn't work out when/);
});

test('cancel by label, kind, id or all; survives a restart (saved to disk)', () => {
  timers.setTimer({ minutes: 5, label: 'laundry' }, t0);   // trash night (previous test) is still pending
  timers.setTimer({ minutes: 20, label: 'tea' }, t0);
  delete require.cache[require.resolve('../lib/timers')];
  delete require.cache[require.resolve('../lib/jsonStore')];
  const reloaded = require('../lib/timers');
  assert.equal(reloaded.list().length, 3, 'trash night + laundry + tea');
  assert.equal(reloaded.cancel('laundry'), 'Cancelled laundry.');
  assert.equal(reloaded.cancel(reloaded.list().find((t) => t.label === 'tea').id), 'Cancelled tea.');
  assert.match(reloaded.cancel('pizza'), /Nothing matching "pizza"/);
  assert.equal(reloaded.cancel('reminder'), 'Cancelled trash night.');
  assert.match(reloaded.setTimer({ seconds: 0 }, t0), /1 second to 24 hours/);
});
