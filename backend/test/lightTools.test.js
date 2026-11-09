// Sentinel's light tools go through lib/devices and never claim success over a failure.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores } = require('./helpers');

tempStores();
const calls = [];
let govee = 'Govee: 6/6 commands ok';
let hue = 'Hue: all lights set';
mockModules({
  sharp: () => ({}),
  '../devices': {
    goveeApply: async (o) => { calls.push(['govee', o]); return govee; },
    hueApply: async (o) => { calls.push(['hue', o]); return hue; },
  },
});
const { executeTool } = require('../lib/sentinel/executeTool');

test('"turn on the lights" = Govee AND Hue in one tool', async () => {
  const r = await executeTool('control_all_lights', { action: 'on' });
  assert.deepEqual(calls, [['govee', { on: true, only: undefined }], ['hue', { on: true }]]);
  assert.equal(r, 'Govee: 6/6 commands ok. Hue: all lights set.');
});

test('a failure is reported as a failure, with an instruction not to claim success', async () => {
  govee = 'Govee: 4/6 commands ok (failed: Neon Rope turn: device offline (code 400))';
  hue = 'Hue: failed: resource, /groups/0/action, not available';
  const r = await executeTool('control_all_lights', { action: 'off' });
  assert.match(r, /Neon Rope/);
  assert.match(r, /do not say it worked/);
});

test('Govee tool: named device, color and brightness map onto lib/devices', async () => {
  calls.length = 0; govee = 'Govee: 1/1 commands ok on Neon Rope';
  await executeTool('control_govee_lights', { action: 'color', value: 'red', device: 'neon rope' });
  await executeTool('control_govee_lights', { action: 'brightness', value: '30', device: 'all' });
  assert.deepEqual(calls[0], ['govee', { color: { r: 255, g: 0, b: 0 }, only: 'neon rope' }]);
  assert.deepEqual(calls[1], ['govee', { brightness: 30, only: undefined }]);
  assert.equal(calls.length, 2, 'Govee tool never touches Hue');
  assert.match(await executeTool('control_govee_lights', { action: 'color', value: 'plaid' }), /Unknown color/);
});
