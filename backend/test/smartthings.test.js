const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, startApp, delay } = require('./helpers');

tempStores();
Object.assign(process.env, { SMARTTHINGS_CLIENT_ID: 'cid', SMARTTHINGS_CLIENT_SECRET: 'csecret', SMARTTHINGS_TOKEN: 'PAT' });
const posts = [];
mockModules({ axios: {
  post: async (url, body, cfg) => {
    const p = Object.fromEntries(new URLSearchParams(body.toString()));
    posts.push({ p, auth: cfg.headers.Authorization });
    await delay(20);
    return p.grant_type === 'authorization_code'
      ? { data: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 86400 } }
      : { data: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 86400 } };
  },
  get: async () => ({ data: { items: [] } }),
} });

const st = require('../lib/smartthings');
const store = require('../lib/tokenStore');

test('smartthings oauth', async (t) => {
  const app = await startApp(require('../routes/smartthings'));
  t.after(app.close);
  const quiet = console.log; console.log = () => {}; t.after(() => { console.log = quiet; });

  await t.test('without a login it falls back to the PAT', async () => {
    assert.equal(await st.getSmartThingsToken(), 'PAT');
  });
  await t.test('code exchange sends Basic auth + body credentials and stores the login', async () => {
    assert.equal((await app.call('POST', '/auth/smartthings/token', { code: 'C0DE' })).status, 200);
    assert.equal(posts[0].auth, 'Basic ' + Buffer.from('cid:csecret').toString('base64'));
    assert.equal(posts[0].p.code, 'C0DE');
    assert.equal(store.get('smartthings').refresh_token, 'RT1');
    assert.equal(await st.getSmartThingsToken(), 'AT1');
  });
  await t.test('expired token refreshes once under concurrency and keeps the rotated refresh token', async () => {
    store.set('smartthings', { ...store.get('smartthings'), expires_at: Date.now() });
    const tokens = await Promise.all([1, 2, 3, 4].map(() => st.getSmartThingsToken()));
    assert.equal(posts.filter((x) => x.p.grant_type === 'refresh_token').length, 1);
    assert.ok(tokens.every((x) => x === 'AT2'));
    assert.equal(store.get('smartthings').refresh_token, 'RT2');
  });
});
