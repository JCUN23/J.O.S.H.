const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

// Mock outbound fetch, but let the test's own calls to 127.0.0.1 through.
const realFetch = global.fetch;
let providers;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, opts);
  const handler = providers[new URL(url).host];
  if (!handler) throw new Error('unexpected host ' + url);
  return handler();
};
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('stoic quote endpoint', async (t) => {
  const app = await startApp(require('../routes/quotes'));
  t.after(app.close);
  const quiet = console.warn; console.warn = () => {}; t.after(() => { console.warn = quiet; });

  await t.test('normalizes the primary provider', async () => {
    providers = { 'stoic.tekloon.net': () => json({ data: { quote: 'Short\r\n@wise.', author: 'Seneca' } }) };
    const r = await app.call('GET', '/api/stoic');
    assert.deepEqual(r.body, { quote: 'Short wise.', author: 'Seneca', source: 'tekloon' });
  });
  await t.test('bad shape (regression: crashed the frontend loop) -> next provider', async () => {
    providers = {
      'stoic.tekloon.net': () => json({ oops: true }),
      'stoic-quotes.com': () => json({ text: 'Be one.', author: 'Marcus Aurelius' }),
    };
    assert.equal((await app.call('GET', '/api/stoic')).body.source, 'stoic-quotes.com');
  });
  await t.test('everything down -> built-in fallback, still a valid shape', async () => {
    providers = { 'stoic.tekloon.net': () => json({}, 500), 'stoic-quotes.com': () => { throw new Error('down'); } };
    const r = await app.call('GET', '/api/stoic');
    assert.equal(r.body.source, 'fallback');
    assert.ok(r.body.quote && r.body.author);
  });
  await t.test('overlong quotes are skipped (bounded retries)', async () => {
    let n = 0;
    providers = { 'stoic.tekloon.net': () => json({ data: { quote: ++n < 3 ? 'x'.repeat(200) : 'Fits.', author: 'Epictetus' } }) };
    const r = await app.call('GET', '/api/stoic');
    assert.equal(r.body.quote, 'Fits.'); assert.equal(n, 3);
  });
});
