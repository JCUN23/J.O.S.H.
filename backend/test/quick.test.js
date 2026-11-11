// Instant commands: whole-sentence everyday phrasings skip the AI; everything else doesn't.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules } = require('./helpers');

const calls = [];
let reply = (tool) => (tool === 'get_time' ? '3:24 PM on Monday, November 9' : 'Govee: 6/6 commands ok. Hue: 2 lights off.');
mockModules({ './executeTool': { executeTool: async (tool, args) => { calls.push([tool, args]); return reply(tool, args); } } });
const { quickCommand } = require('../lib/sentinel/quick');

test('everyday phrasings run the tool directly', async () => {
  const cases = [
    ['Alfred, turn off the lights.', 'control_all_lights', { action: 'off' }],
    ['lights on please', 'control_all_lights', { action: 'on' }],
    ['turn all the lights off', 'control_all_lights', { action: 'off' }],
    ['make the lights blue', 'control_all_lights', { action: 'color', value: 'blue' }],
    ['set the lights to 40%', 'control_all_lights', { action: 'brightness', value: '40' }],
    ['brightness 150', 'control_all_lights', { action: 'brightness', value: '100' }],
    ['pause the music', 'control_spotify', { action: 'pause' }],
    ['resume the music', 'control_spotify', { action: 'play' }],
    ['skip', 'control_spotify', { action: 'next' }],
    ['go back', 'control_spotify', { action: 'previous' }],
  ];
  for (const [said, tool, args] of cases) {
    calls.length = 0;
    const r = await quickCommand(said);
    assert.ok(r?.quick, said);
    assert.deepEqual(calls, [[tool, args]], said);
  }
  assert.equal((await quickCommand('what time is it')).response, "It's 3:24 PM on Monday, November 9.");
});

test('anything longer, compound or with a device goes to the AI', async () => {
  for (const said of ['save this playlist and turn on the lights', 'resume the music on the frame', 'turn off the lights in 10 minutes',
    'make the lights a sunset vibe', 'what games are on today', 'turn off the tv']) {
    assert.equal(await quickCommand(said), null, said);
  }
});

test('a failure is reported, never a cheerful "Done."', async () => {
  reply = () => 'Govee: 4/6 commands ok (failed: Neon Rope turn: offline). Hue: 2 lights off.';
  const r = await quickCommand('lights off');
  assert.match(r.response, /Neon Rope/);
});

test('sign-offs end the conversation; "thanks, now ..." is still a command (Nov 11)', async () => {
  for (const said of ['Thanks.', 'thank you', 'Thank you so much, Alfred', "that's all", 'That will be all.', "ok that's it",
    "I'm good", 'never mind', 'nope', 'cool thanks', 'all set', 'stop listening', 'perfect, thanks man']) {
    calls.length = 0;
    const r = await quickCommand(said);
    assert.ok(r?.endConversation, said);
    assert.ok(r.response.length > 0 && calls.length === 0, `${said}: replies, runs nothing`);
  }
  assert.equal((await quickCommand('good night Alfred')).response, 'Good night.');
  for (const said of ["Thanks. Now set the lights to white while you're at it.", 'thanks for the weather, what about tomorrow',
    'thank you, play discover weekly', 'tell me that is all']) {
    assert.equal(await quickCommand(said), null, `${said}: goes to the AI`);
  }
});
