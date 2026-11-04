const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tempStores, delay, httpError } = require('./helpers');

const dir = tempStores();
const store = require('../lib/tokenStore');
const { getValidToken, toStored, publicView } = require('../lib/oauth');

test('fresh token is returned without refreshing', async () => {
  store.set('p', toStored({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }));
  let calls = 0;
  const t = await getValidToken('p', async () => { calls++; return {}; });
  assert.equal(t.access_token, 'A1');
  assert.equal(calls, 0);
});

test('concurrent callers near expiry trigger exactly one refresh (rotation-safe)', async () => {
  store.set('p', { ...toStored({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }), expires_at: Date.now() + 1000 });
  let calls = 0;
  const refresh = async (rt) => { calls++; await delay(30); return { access_token: 'A2', refresh_token: rt === 'R1' ? 'R2' : 'WRONG', expires_in: 3600 }; };
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => getValidToken('p', refresh)));
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.access_token === 'A2'));
  assert.equal(store.get('p').refresh_token, 'R2');
});

test('refresh that omits refresh_token keeps the previous one', async () => {
  store.set('p', { ...store.get('p'), expires_at: 0 });
  await getValidToken('p', async () => ({ access_token: 'A3', expires_in: 60 }));
  assert.equal(store.get('p').refresh_token, 'R2');
});

test('revoked login (invalid_grant) is cleared and returns null', async () => {
  store.set('p', { ...store.get('p'), expires_at: 0 });
  const t = await getValidToken('p', async () => { throw httpError(400, { error: 'invalid_grant' }); });
  assert.equal(t, null);
  assert.equal(store.get('p'), null);
});

test('transient failure rethrows and keeps the login', async () => {
  store.set('q', toStored({ access_token: 'B', refresh_token: 'RB', expires_in: 0 }));
  await assert.rejects(getValidToken('q', async () => { throw new Error('ECONNRESET'); }));
  assert.ok(store.get('q'));
});

test('expires_in of 0 stays 0 (regression: || turned it into an hour)', () => {
  const t = toStored({ access_token: 'x', expires_in: 0 });
  assert.ok(t.expires_at <= Date.now() + 5);
  const missing = toStored({ access_token: 'x' });
  assert.ok(missing.expires_at > Date.now() + 3500 * 1000);
});

test('browsers never see the refresh token', () => {
  assert.deepEqual(Object.keys(publicView(store.get('q'))).sort(), ['access_token', 'expires_at']);
});

test('store file is 0600 and writes are atomic (no temp files left)', () => {
  assert.equal((fs.statSync(store.STORE_PATH).mode & 0o777).toString(8), '600');
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
});

test('a corrupt store file is parked, not silently overwritten', () => {
  const { createJsonStore } = require('../lib/jsonStore');
  const file = path.join(dir, 'corrupt.json');
  fs.writeFileSync(file, '{not json');
  const errors = []; const orig = console.error; console.error = (m) => errors.push(m);
  try {
    const s = createJsonStore(file);
    assert.equal(s.get('x'), null);
  } finally { console.error = orig; }
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('corrupt.json.corrupt-')));
  assert.equal(errors.length, 1);
});
