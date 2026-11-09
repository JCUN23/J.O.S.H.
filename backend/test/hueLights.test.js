// Only the two Go lamps: the widget, "all lights", the AI tool.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, startApp } = require('./helpers');

Object.assign(process.env, { HUE_BRIDGE_IP: '10.0.0.2', HUE_USERNAME: 'u' });
delete process.env.HUE_LIGHTS;
const BRIDGE = {
  1: { name: 'Hue color lamp 1', state: { on: false } }, 2: { name: 'Hue color lamp 2', state: { on: false } },
  3: { name: 'Hue color lamp 3', state: { on: false } }, 4: { name: 'Right Go', state: { on: true } }, 5: { name: 'Left Go', state: { on: true } },
};
const GROUPS = { 1: { name: 'Office', type: 'Room', lights: ['4', '5'] }, 2: { name: 'Living room', type: 'Room', lights: ['1', '2', '5'] } };
const puts = [];
mockModules({ axios: {
  get: async (url) => ({ data: url.endsWith('/lights') ? BRIDGE : GROUPS }),
  put: async (url, body) => { puts.push([url.replace(/^.*\/api\/u/, ''), body]); return { data: [{ success: {} }] }; },
} });
const hl = require('../lib/hueLights');
const { hueApply } = require('../lib/devices');

test('default: just Left Go and Right Go; ids and * work; no match shows all', () => {
  assert.deepEqual(Object.keys(hl.filterLights(BRIDGE)), ['4', '5']);
  process.env.HUE_LIGHTS = '1, right go';
  assert.deepEqual(Object.keys(hl.filterLights(BRIDGE)), ['1', '4']);
  process.env.HUE_LIGHTS = '*';
  assert.equal(Object.keys(hl.filterLights(BRIDGE)).length, 5);
  process.env.HUE_LIGHTS = 'Bedroom';
  const warn = console.warn; console.warn = () => {};
  try { assert.equal(Object.keys(hl.filterLights(BRIDGE)).length, 5); } finally { console.warn = warn; }
  delete process.env.HUE_LIGHTS;
  assert.deepEqual(hl.filterLights([{ error: { type: 1 } }]), [{ error: { type: 1 } }], 'bridge errors pass through');
});

test('rooms with other bulbs in them are hidden', () => {
  assert.deepEqual(Object.keys(hl.filterGroups(GROUPS, BRIDGE)), ['1']);
});

test('"turn off the lights" touches only the Go lamps, not group 0', async () => {
  puts.length = 0;
  assert.equal(await hueApply({ on: false }), 'Hue: 2 lights off');
  assert.deepEqual(puts.map(([u]) => u), ['/lights/4/state', '/lights/5/state']);
});

test('widget routes list only the Go lamps and their room', async (t) => {
  const app = await startApp(require('../routes/hue')); t.after(app.close);
  assert.deepEqual(Object.keys((await app.call('GET', '/api/hue/lights')).body), ['4', '5']);
  assert.deepEqual(Object.keys((await app.call('GET', '/api/hue/groups')).body), ['1']);
});
