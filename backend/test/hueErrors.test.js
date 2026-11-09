// The Hue bridge reports failures inside HTTP 200 bodies.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules } = require('./helpers');

Object.assign(process.env, { HUE_BRIDGE_IP: '10.0.0.2', HUE_USERNAME: 'u', HUE_LIGHTS: '*' });   // group-0 path
let reply = [{ success: { '/groups/0/action/on': true } }];
mockModules({ axios: { put: async () => ({ status: 200, data: reply }), get: async () => ({ data: {} }) } });
const { hueApply } = require('../lib/devices');

test('hueApply reads the body, not the status', async () => {
  assert.equal(await hueApply({ on: true }), 'Hue: all lights set');
  reply = [{ error: { type: 1, address: '/groups/0/action', description: 'unauthorized user' } }];
  assert.equal(await hueApply({ on: false }), 'Hue: failed: unauthorized user');
  reply = [{ error: { description: 'resource, /lights/5/state, not available' } }];
  assert.equal(await hueApply({ on: true, lightIds: ['5', '4'] }), 'Hue: failed: resource, /lights/5/state, not available');
});
