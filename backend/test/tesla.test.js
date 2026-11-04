const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, startApp, httpError } = require('./helpers');

tempStores();
const calls = []; let mode = 'ok';
const axios = async (cfg) => {
  calls.push(`${cfg.method.toUpperCase()} ${cfg.url}`);
  if (mode === 'asleep') throw httpError(408, {});
  if (cfg.url.endsWith('/vehicles')) return { data: { response: [{ id: Number('3744444444444444123') /* > 2^53: rounds, like JSON.parse does */, id_s: '3744444444444444123', vin: '5YJ3TESTVIN000001' }] } };
  if (cfg.url.endsWith('/vehicle_data')) return { data: { response: { charge_state: { battery_level: 80 } } } };
  return { data: { response: mode === 'reject' ? { result: false, reason: 'vehicle unavailable' } : { result: true } } };
};
axios.post = async () => ({ data: { access_token: 'T', expires_in: 3600 } });
mockModules({ axios });

test('tesla fleet api routes', async (t) => {
  const app = await startApp(require('../routes/tesla'));
  t.after(app.close);
  const auth = { Authorization: 'Bearer T' };
  const quiet = console.error; console.error = () => {}; t.after(() => { console.error = quiet; });

  await t.test('no login -> 401', async () => {
    assert.equal((await app.call('GET', '/api/tesla/vehicle')).status, 401);
  });
  await t.test('unwraps { response } and addresses the car by VIN, not the rounded numeric id', async () => {
    const r = await app.call('GET', '/api/tesla/vehicle', undefined, auth);
    assert.equal(r.body.charge_state.battery_level, 80);
    assert.ok(calls.some((c) => c.includes('/vehicles/5YJ3TESTVIN000001/vehicle_data')));
  });
  await t.test('maps commands to Fleet API endpoints', async () => {
    await app.call('POST', '/api/tesla/command', { command: 'climate', value: true }, auth);
    assert.ok(calls.at(-1).endsWith('/command/auto_conditioning_start'));
    await app.call('POST', '/api/tesla/command', { command: 'climate', value: false }, auth);
    assert.ok(calls.at(-1).endsWith('/command/auto_conditioning_stop'));
    assert.equal((await app.call('POST', '/api/tesla/command', { command: 'self_destruct' }, auth)).status, 400);
  });
  await t.test('in-band rejection -> 409, asleep -> 408', async () => {
    mode = 'reject';
    const r = await app.call('POST', '/api/tesla/command', { command: 'lock' }, auth);
    assert.equal(r.status, 409); assert.equal(r.body.error, 'vehicle unavailable');
    mode = 'asleep';
    assert.equal((await app.call('GET', '/api/tesla/vehicle', undefined, auth)).status, 408);
  });
});
