// Calendar answers from the server-side Google login (works from the Pi mic, no browser).
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules } = require('./helpers');

const now = new Date(2026, 10, 9, 15, 0);   // Mon Nov 9 2026, 3 PM
mockModules({ axios: { get: async (url) => {
  if (url.endsWith('/calendarList')) return { data: { items: [{ id: 'me', summary: 'Josh' }, { id: 'shared', summary: 'Lynz & Josh' }] } };
  const shared = { id: 'e2', iCalUID: 'same', summary: 'Ollie Day Care Day', start: { date: '2026-11-10' } };
  if (url.includes('/calendars/me/')) return { data: { items: [{ id: 'e1', summary: 'Chiro', start: { dateTime: '2026-11-10T17:15:00-05:00' } }, shared] } };
  return { data: { items: [shared] } };
} } });
const cal = require('../lib/calendar');

test('tomorrow: all calendars, shared event once, all-day dates are local', async () => {
  const r = await cal.answer('tomorrow', { now, token: 't' });
  assert.equal(r, 'Tomorrow: Ollie Day Care Day (all day), Chiro (5:15 PM).');
});

test('windows: today, weekend from a Monday, default week', () => {
  const day = (d) => d.toDateString();
  assert.deepEqual(cal.windowFor('today', now).slice(0, 2).map(day), ['Mon Nov 09 2026', 'Tue Nov 10 2026']);
  assert.deepEqual(cal.windowFor('weekend', now).slice(0, 2).map(day), ['Sat Nov 14 2026', 'Mon Nov 16 2026']);
  assert.equal(cal.windowFor(undefined, now)[2], 'the next 7 days');
});
