// Full panel coverage: printer control, calendar edits, Spotify extras, rules/activity/
// presence, send to phone, panel control.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores, httpError } = require('./helpers');

const dir = tempStores();
for (const k of ['ACTIVITY', 'RULES']) process.env[`${k}_STORE_PATH`] = path.join(dir, `${k.toLowerCase()}.json`);
Object.assign(process.env, { BAMBU_HOST: '10.0.0.9', BAMBU_SERIAL: 'SN1', BAMBU_ACCESS_CODE: 'x' });

const http = { calls: [], playing: null, gcalEvents: [], likeFails: null };
const pushes = [];
mockModules({
  sharp: () => ({}),
  './notify': { notify: async (n) => { pushes.push(n); return process.env.NTFY_TOPIC ? { sent: true } : { sent: false, reason: 'NTFY_TOPIC not set' }; } },
  '../notify': { notify: async (n) => { pushes.push(n); return process.env.NTFY_TOPIC ? { sent: true } : { sent: false, reason: 'NTFY_TOPIC not set' }; } },
  axios: {
    get: async (url, opts = {}) => {
      http.calls.push(['GET', url]);
      if (url.endsWith('/me/player/currently-playing')) return http.playing ? { status: 200, data: http.playing } : { status: 204, data: '' };
      if (url.endsWith('/search')) return { data: { tracks: { items: [{ name: 'Redbone', uri: 'spotify:track:rb', artists: [{ name: 'Childish Gambino' }] }] } } };
      if (url.endsWith('/calendarList')) return { data: { items: [{ id: 'primary', summary: 'Josh', accessRole: 'owner' }] } };
      if (url.includes('/events')) return { data: { items: http.gcalEvents } };
      throw new Error(`unexpected GET ${url}`);
    },
    put: async (url, body, opts = {}) => { http.calls.push(['PUT', url, body, opts.params]); if (url.endsWith('/me/tracks') && http.likeFails) throw http.likeFails; return { data: {} }; },
    post: async (url, body, opts = {}) => { http.calls.push(['POST', url, body, opts.params]); return { data: {} }; },
    patch: async (url, body) => { http.calls.push(['PATCH', url, body]); return { data: { summary: 'Dinner', start: body.start } }; },
    delete: async (url) => { http.calls.push(['DELETE', url]); return { data: {} }; },
  },
});
const { executeTool } = require('../lib/sentinel/executeTool');
const bambu = require('../lib/bambu');

test('printer: stop asks first; a printer that ignores commands is explained; pause confirmed by state', async () => {
  bambu._reset();
  bambu.ingest({ print: { gcode_state: 'RUNNING', subtask_name: 'Cable_clips', mc_percent: 62 } });
  const sent = [];
  bambu._useClient({ connected: true, publish: (topic, msg) => sent.push(JSON.parse(msg)) });
  assert.match(await executeTool('printer_control', { action: 'stop' }), /can't be undone\. Ask Josh to confirm/);
  assert.equal(sent.length, 0, 'nothing sent without confirmation');
  // the printer ignores it (not in Developer Mode)
  const ignored = await bambu.command('pause', { timeoutMs: 60, pollMs: 10 });
  assert.deepEqual(ignored, { ok: false, why: 'no-change' });
  assert.equal(sent[0].print.command, 'pause');
  // the printer accepts: state changes to PAUSE
  setTimeout(() => bambu.ingest({ print: { gcode_state: 'PAUSE' } }), 20);
  assert.deepEqual(await bambu.command('pause', { timeoutMs: 500, pollMs: 10 }), { ok: true, state: 'PAUSE' });
  bambu._useClient(null);
});

test('calendar: move keeps the length; delete only after confirm; several matches ask which', async () => {
  http.gcalEvents = [{ id: 'd1', summary: 'Dinner', start: { dateTime: '2026-11-13T19:00:00-05:00' }, end: { dateTime: '2026-11-13T20:30:00-05:00' } }];
  const cal = require('../lib/calendar');
  const now = new Date(2026, 10, 9, 12);
  const moved = await cal.updateEvent({ match: 'dinner', newStart: '2026-11-13T20:00' }, { token: 't', now });
  assert.match(moved, /^Updated "Dinner": now Friday, Nov 13(,| at) 8:00 PM\.$/);
  const patch = http.calls.find((c) => c[0] === 'PATCH');
  assert.deepEqual(patch[2].end, { dateTime: '2026-11-13T21:30:00', timeZone: 'America/Detroit' });
  assert.match(await cal.deleteEvent({ match: 'dinner' }, { token: 't', now }), /Ask Josh to confirm/);
  assert.equal(http.calls.filter((c) => c[0] === 'DELETE').length, 0);
  assert.match(await cal.deleteEvent({ match: 'dinner', confirm: true }, { token: 't', now }), /^Deleted "Dinner"/);
  http.gcalEvents = [...http.gcalEvents, { id: 'd2', summary: 'Dinner with Mom', start: { dateTime: '2026-11-15T18:00:00-05:00' }, end: { dateTime: '2026-11-15T19:00:00-05:00' } }];
  assert.match(await cal.deleteEvent({ match: 'dinner' }, { token: 't', now }), /I found 2: .*Which one\?/);
  http.gcalEvents = [];
  assert.match(await cal.updateEvent({ match: 'gym', newStart: '2026-11-13T08:00' }, { token: 't', now }), /couldn't find "gym"/);
});

test("spotify extras: what's playing, like, queue, more like this; like without the permission", async () => {
  const run = (action, value) => executeTool('control_spotify', { action, value }, { spotifyToken: 'tok' });
  assert.equal(await run('now_playing'), 'Nothing is playing on Spotify right now.');
  http.playing = { is_playing: true, item: { id: 't1', name: 'Midnight', album: { name: 'Night Shift' }, artists: [{ name: 'Gotham Strings', id: 'a1', uri: 'spotify:artist:a1' }] } };
  assert.equal(await run('now_playing'), 'Playing "Midnight" by Gotham Strings, from Night Shift.');
  assert.equal(await run('like'), 'Saved "Midnight" to your Liked Songs.');
  assert.equal(await run('queue', 'redbone'), 'Added "Redbone" by Childish Gambino to the queue.');
  assert.ok(http.calls.some((c) => c[0] === 'POST' && c[1].endsWith('/me/player/queue') && c[3].uri === 'spotify:track:rb'));
  assert.equal(await run('more_like_this'), 'Playing more Gotham Strings on shuffle.');
  http.likeFails = httpError(403, { error: { message: 'Insufficient client scope' } });
  assert.match(await run('like'), /needs one Spotify re-login/);
  http.likeFails = null;
});

test('rules, activity, presence, send to phone', async () => {
  const listed = await executeTool('list_rules', {});
  assert.match(listed, /^On: .*Off: /);
  const rules = require('../lib/rules').list();
  const target = rules[0];
  const word = target.name.split(' ').find((w) => w.length > 3);
  assert.match(await executeTool('set_rule', { name: word, enabled: !target.enabled }), new RegExp(`Turned ${target.enabled ? 'off' : 'on'}`));
  assert.match(await executeTool('set_rule', { name: 'zebra crossing', enabled: true }), /No rule matches/);
  const activity = require('../lib/activity');
  activity.log({ source: 'presence', title: 'Josh left home', results: ['presence: away'] });
  activity.log({ source: 'gameday', title: 'Game Day: Detroit Lions', results: ['Govee: 4/4 commands ok'] });
  const summary = await executeTool('activity_summary', { since_away: true });
  assert.match(summary, /Game Day: Detroit Lions/);
  assert.match(await executeTool('presence_status', {}), /Presence is not set up|:/);
  delete process.env.NTFY_TOPIC;
  assert.match(await executeTool('send_to_phone', { message: 'buy milk' }), /Couldn't send it \(NTFY_TOPIC not set\)/);
  process.env.NTFY_TOPIC = 'demo';
  assert.equal(await executeTool('send_to_phone', { message: 'Lions 21, Packers 10' }), 'Sent to your phone.');
  assert.equal(pushes.at(-1).message, 'Lions 21, Packers 10');
});

test('panel control: acknowledgements; instant phrases route to it', async () => {
  assert.equal(await executeTool('control_panel', { action: 'show', target: 'calendar' }), 'Showing the calendar widget on the panel.');
  const { quickCommand } = require('../lib/sentinel/quick');
  const cases = [['show me the calendar', { action: 'show', target: 'calendar' }], ['open the music', { action: 'show', target: 'spotify' }],
    ['dark mode', { action: 'mode', target: 'dark' }], ['switch to light mode', { action: 'mode', target: 'light' }],
    ['lock the screen', { action: 'lock' }], ['go to sleep', { action: 'idle' }]];
  for (const [said, args] of cases) {
    const r = await quickCommand(said);
    assert.deepEqual(r.toolsExecuted[0].args, args, said);
  }
});
