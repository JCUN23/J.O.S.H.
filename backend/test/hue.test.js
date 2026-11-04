const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, startApp } = require('./helpers');

process.env.HUE_BRIDGE_IP = '10.0.0.2';
process.env.HUE_USERNAME = 'user';
let reply;
mockModules({ axios: { get: async () => ({ data: reply }), put: async () => ({ data: [{ success: {} }] }) } });

test('hue routes', async (t) => {
  const app = await startApp(require('../routes/hue'));
  t.after(app.close);

  await t.test('bridge "unauthorized user" becomes a 502 with a readable message (regression: black screen)', async () => {
    reply = [{ error: { type: 1, address: '/', description: 'unauthorized user' } }];
    const orig = console.error; console.error = () => {};
    try {
      for (const url of ['/api/hue/lights', '/api/hue/groups', '/api/hue/scenes']) {
        const r = await app.call('GET', url);
        assert.equal(r.status, 502, url);
        assert.match(r.body.error, /HUE_USERNAME/);
      }
    } finally { console.error = orig; }
  });

  await t.test('a normal light map passes through untouched', async () => {
    reply = { 1: { name: 'Desk', state: { on: true, bri: 200 } } };
    const r = await app.call('GET', '/api/hue/lights');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, reply);
  });
});
