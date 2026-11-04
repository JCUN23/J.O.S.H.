const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');
const newsRouter = require('../routes/news');
const { parseFeed, getNews, cache, SOURCES } = newsRouter._test;

const RSS = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
  <item><title><![CDATA[Lions &amp; Pistons win]]></title><link>https://ex.test/a</link>
    <description><![CDATA[<p>Big night&nbsp;in <b>Detroit</b> &#8212; again.</p>]]></description>
    <pubDate>Wed, 04 Nov 2026 18:00:00 GMT</pubDate><media:content url="https://img.test/a.jpg"/></item>
  <item><title>No link, dropped</title></item>
</channel></rss>`;
const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title>
  <link rel="alternate" href="https://ex.test/b"/><summary>Short summary</summary><updated>2026-11-04T19:00:00Z</updated></entry></feed>`;

test('parses RSS: CDATA, entities, HTML stripped, thumbnail, bad items dropped', () => {
  const [a, ...rest] = parseFeed(RSS, { name: 'Ex' });
  assert.equal(rest.length, 0);
  assert.equal(a.title, 'Lions & Pistons win');
  assert.equal(a.description, 'Big night in Detroit — again.');
  assert.equal(a.thumbnail, 'https://img.test/a.jpg');
  assert.equal(a.pubDate, '2026-11-04T18:00:00.000Z');
});

test('parses Atom feeds', () => {
  const [b] = parseFeed(ATOM, { name: 'Ex' });
  assert.equal(b.url, 'https://ex.test/b');
  assert.equal(b.title, 'Atom story');
});

const ok = (body) => ({ ok: true, status: 200, text: async () => body });

test('tries every source: one dead feed does not empty the category', async () => {
  cache.clear();
  const [first, second] = SOURCES.tech;
  const fake = async (url) => {
    if (url === first.url) throw new Error('ECONNRESET');
    if (url === second.url) return ok(RSS);
    return ok(ATOM);
  };
  const r = await getNews('tech', 10, fake);
  assert.ok(r.articles.length >= 2);
  assert.deepEqual(r.sources.find((s) => s.name === first.name), { name: first.name, ok: false, error: 'ECONNRESET' });
  assert.ok(r.articles.every((a) => a.category === 'tech'));
});

test('a feed that fails later is served stale from cache, and says so', async () => {
  cache.clear();
  const src = SOURCES.world[0];
  await getNews('world', 10, async () => ok(RSS));
  for (const v of cache.values()) v.at -= 11 * 60 * 1000; // older than fresh, within stale window
  const r = await getNews('world', 10, async () => { throw new Error('down'); });
  const status = r.sources.find((s) => s.name === src.name);
  assert.equal(status.stale, true);
  assert.ok(r.articles.length > 0);
});

test('"all" mixes categories and de-duplicates by URL', async () => {
  cache.clear();
  const r = await getNews('all', 20, async () => ok(RSS));
  assert.equal(new Set(r.articles.map((a) => a.url)).size, r.articles.length);
});

test('HTTP: unknown category 400, all sources down 502 (no fake headlines)', async (t) => {
  cache.clear();
  const realFetch = global.fetch;
  global.fetch = async (url, o) => (String(url).startsWith('http://127.0.0.1') ? realFetch(url, o) : (() => { throw new Error('offline'); })());
  t.after(() => { global.fetch = realFetch; });
  const app = await startApp(newsRouter);
  t.after(app.close);
  assert.equal((await app.call('GET', '/api/news?category=gossip')).status, 400);
  const r = await app.call('GET', '/api/news?category=sports');
  assert.equal(r.status, 502);
  assert.deepEqual(r.body.articles, []);
  assert.ok(r.body.sources.every((s) => s.ok === false));
});
