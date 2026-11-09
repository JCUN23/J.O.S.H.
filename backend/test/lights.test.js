// "Turn off the lights": Govee + Hue, and an honest answer when something fails.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, startApp } = require('./helpers');

tempStores();
let govee = 'Govee: 6/6 commands ok';
let hue = 'Hue: all lights set';
const calls = [];
mockModules({ '../lib/devices': {
  goveeApply: async (o) => { calls.push(['govee', o]); if (govee instanceof Error) throw govee; return govee; },
  hueApply: async (o) => { calls.push(['hue', o]); return hue; },
} });
const { forSpeech } = require('../lib/speech');

test('lights off hits Govee AND Hue; ok only when both worked', async (t) => {
  const app = await startApp(require('../routes/home')); t.after(app.close);
  let r = await app.call('POST', '/api/lights', { on: false });
  assert.deepEqual(calls, [['govee', { on: false }], ['hue', { on: false }]]);
  assert.equal(r.body.ok, true);
  govee = 'Govee: 4/6 commands ok (failed: Neon Rope turn: device offline (code 400))';
  r = await app.call('POST', '/api/lights', { on: false });
  assert.equal(r.body.ok, false);
  assert.match(r.body.failed[0], /Neon Rope/);
  govee = new Error('Govee down');
  r = await app.call('POST', '/api/lights', {});
  assert.equal(calls.at(-1)[1].on, true);
  assert.match(r.body.failed[0], /error: Govee down/);
});

test('forSpeech: units the way a person says them', () => {
  assert.equal(forSpeech('High of 54°F with a low of 45°F.'), 'High of 54 degrees with a low of 45 degrees.');
  assert.equal(forSpeech('Bed 60°C, 75% done'), 'Bed 60 degrees Celsius, 75 percent done');
});
