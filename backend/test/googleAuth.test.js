// Google Calendar sign-in: a login without the calendar scope is refused with a clear message.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, startApp } = require('./helpers');

tempStores();
Object.assign(process.env, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' });

let grantedScope = '';
mockModules({ axios: {
  post: async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return { data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: grantedScope } };
    }
    throw new Error(`unexpected POST ${url}`);
  },
  get: async () => ({ data: {} }),
} });

const store = require('../lib/tokenStore');

test('calendar box unticked: refused, nothing stored; ticked: stored', async (t) => {
  const app = await startApp(require('../routes/auth'));
  t.after(app.close);

  grantedScope = 'openid https://www.googleapis.com/auth/userinfo.email';
  const bad = await app.call('POST', '/auth/google/token', { code: 'c1' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'calendar_scope_missing');
  assert.match(bad.body.message, /tick the calendar box/);
  assert.equal(store.get('google') ?? null, null, 'email-only login is not kept');

  grantedScope = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email';
  const good = await app.call('POST', '/auth/google/token', { code: 'c2' });
  assert.equal(good.status, 200);
  assert.equal(store.get('google').refresh_token, 'rt');
  assert.equal(JSON.stringify(good.body).includes('rt'), false, 'refresh token never sent to the browser');
});
