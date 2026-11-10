// Web answers, long-term memory, calendar writes, tool routing.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores, httpError } = require('./helpers');

const dir = tempStores();
process.env.MEMORY_STORE_PATH = path.join(dir, 'memory.json');
const gcal = { posts: [], deletes: [], fail: null };
mockModules({ axios: {
  get: async (url) => ({ data: { items: [{ id: 'primary', summary: 'Josh', accessRole: 'owner' }, { id: 'fam', summary: 'Family', accessRole: 'writer' }, { id: 'hol', summary: 'Holidays', accessRole: 'reader' }] } }),
  post: async (url, body) => { if (gcal.fail) throw gcal.fail; gcal.posts.push({ url, body }); return { data: { id: 'ev1' } }; },
  delete: async (url) => { gcal.deletes.push(url); return { data: {} }; },
} });

test('web search: browser_search request, answer cleaned for speech', async () => {
  const { webSearch } = require('../lib/sentinel/webSearch');
  let sent;
  const post = async (body) => { sent = body; return { data: { choices: [{ message: { content: 'Michigan beat Ohio State **27–24** on Saturday【3†L4-L9】. See [ESPN](https://espn.com/x) for more.' } }] } }; };
  const r = await webSearch('who won the michigan game', { post });
  assert.deepEqual(sent.tools, [{ type: 'browser_search' }]);
  assert.equal(sent.tool_choice, 'required');
  assert.equal(r, 'Michigan beat Ohio State 27–24 on Saturday. See ESPN for more.');
  const failed = await webSearch('x', { post: async () => { throw httpError(429, { error: { message: 'rate limited' } }); } });
  assert.match(failed, /Web search failed \(rate limited\)\. Don't guess/);
});

test('long-term memory: remember, dedupe, list, forget by words or all, in the prompt', () => {
  const mem = require('../lib/sentinel/longMemory');
  assert.match(mem.remember('Josh likes the lights at 40% after 9 PM'), /I'll remember/);
  assert.equal(mem.remember('josh likes the lights at 40% after 9 pm.'), 'I already have that.');
  mem.remember("Josh's mom's birthday is March 3");
  assert.match(mem.promptBlock(), /- Josh likes the lights at 40% after 9 PM\n- Josh's mom's birthday is March 3/);
  assert.equal(mem.forget('birthday'), "Forgotten: Josh's mom's birthday is March 3.");
  assert.match(mem.forget('pizza'), /don't have anything about "pizza"/);
  assert.equal(mem.forget('everything'), 'Forgotten: all 1 things.');
  assert.equal(mem.promptBlock(), '');
});

test('calendar write: timed and all-day events, named calendar, undo', async () => {
  const cal = require('../lib/calendar');
  const now = new Date(2026, 10, 9, 15, 0);
  const r = await cal.createEvent({ title: 'Dinner', start: '2026-11-13T19:00', durationMinutes: 90 }, { token: 't', now });
  assert.match(r, /^Added "Dinner" to your calendar: Friday, Nov 13(,| at) 7:00 PM\.$/);   // Node versions format "at" differently
  assert.deepEqual(gcal.posts[0].body, { summary: 'Dinner', start: { dateTime: '2026-11-13T19:00:00', timeZone: 'America/Detroit' }, end: { dateTime: '2026-11-13T20:30:00', timeZone: 'America/Detroit' } });
  const allDay = await cal.createEvent({ title: 'Trash day', start: '2026-11-17', calendar: 'family' }, { token: 't', now });
  assert.match(allDay, /Added "Trash day" to Family: Tuesday, Nov 17 \(all day\)/);
  assert.match(gcal.posts[1].url, /calendars\/fam\/events$/);
  assert.deepEqual(gcal.posts[1].body.end, { date: '2026-11-18' });
  assert.match(await cal.createEvent({ title: 'x', start: '2026-11-17', calendar: 'holidays' }, { token: 't', now }), /can't add to a calendar called "holidays"/);
  assert.match(await cal.createEvent({ title: 'x', start: '2026-11-01T10:00' }, { token: 't', now }), /in the past/);
  assert.equal(await cal.undoLast({ token: 't' }), 'Removed "Trash day" from the calendar.');
  assert.match(gcal.deletes[0], /calendars\/fam\/events\/ev1$/);
  assert.match(await cal.undoLast({ token: 't' }), /haven't added any events/);
});

test('calendar write without the write permission: says how to fix it', async () => {
  const cal = require('../lib/calendar');
  gcal.fail = httpError(403, { error: { message: 'Request had insufficient authentication scopes.' } });
  assert.match(await cal.createEvent({ title: 'x', start: '2026-12-01T10:00' }, { token: 't', now: new Date(2026, 10, 9) }), /disconnect Google and connect it again/);
  gcal.fail = null;
});

test('tool routing: only the groups a request needs; follow-ups keep them; unknown = all', () => {
  const { pickTools } = require('../lib/sentinel/toolRouter');
  const { SENTINEL_TOOLS } = require('../lib/sentinel/tools');
  const names = (msg, hist) => pickTools(SENTINEL_TOOLS, msg, hist).map((t) => t.function.name);
  assert.deepEqual(names('turn off the lights and play some jazz').sort(),
    ['activate_scene', 'control_all_lights', 'control_govee_lights', 'control_hue_lights', 'control_spotify', 'play_music', 'save_playlist_shortcut', 'web_search']);
  assert.ok(names('make them blue', [{ role: 'user', content: 'turn on the lights' }]).includes('control_all_lights'));
  assert.ok(names('remind me at 5 to call mom').includes('set_reminder'));
  // Nov 9: "lighting" and a scene name must bring the scene tool along with the music ones
  const combo = names('apply relax lighting and put on discover weekly on the frame');
  for (const t of ['activate_scene', 'play_music', 'control_tv']) assert.ok(combo.includes(t), `${t} missing`);
  assert.ok(names('movie night and play some jazz').includes('activate_scene'), 'scene by name');
  assert.ok(names('add dinner with Lynz Friday at 7').includes('create_calendar_event'));
  assert.equal(names('tell me a joke').length, SENTINEL_TOOLS.length, 'nothing matched: every tool');
  const all = JSON.stringify(SENTINEL_TOOLS).length;
  const lights = JSON.stringify(pickTools(SENTINEL_TOOLS, 'lights off')).length;
  assert.ok(lights < all / 3, `lights-only request sends ${lights} of ${all} chars`);
});
