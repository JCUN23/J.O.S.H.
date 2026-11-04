// News headlines, fetched server-side.
// Replaces the browser fetching RSS through the public allorigins CORS proxy
// (frequent CORS/timeouts) and a silent fallback to made-up headlines.
//
// GET /api/news?category=tech|world|sports|business|all&limit=10
//   -> { articles: [...], sources: [{ name, ok, cached, error? }] }
// Every source in a category is tried; each is cached for 10 minutes and served
// stale (up to 6 hours) if it later fails, so one flaky feed never empties the widget.
const express = require('express');
const { XMLParser } = require('fast-xml-parser');

const router = express.Router();

const SOURCES = {
  tech: [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  ],
  world: [
    { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'NPR', url: 'https://feeds.npr.org/1004/rss.xml' }, // Reuters ended public RSS
  ],
  sports: [
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
  ],
  business: [
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
    { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  ],
};
const CATEGORIES = Object.keys(SOURCES);

const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const cache = new Map(); // url -> { at, articles }

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: false, processEntities: true });

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (x == null ? '' : typeof x === 'object' ? String(x['#text'] ?? '') : String(x));
const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“' };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&[a-z]+;|&#39;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
const clean = (s, max) => {
  const t = decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
};

// RSS 2.0 (<rss><channel><item>) and Atom (<feed><entry>) -> normalized articles
function parseFeed(body, source) {
  const doc = xml.parse(body);
  const items = asArray(doc?.rss?.channel?.item);
  const entries = asArray(doc?.feed?.entry);
  const rss = items.map((it) => ({
    title: clean(text(it.title)),
    url: text(it.link) || text(it.guid),
    description: clean(text(it.description), 150),
    pubDate: it.pubDate || it['dc:date'],
    thumbnail: it['media:content']?.['@_url'] || it['media:thumbnail']?.['@_url']
      || asArray(it.enclosure).find((e) => String(e['@_type'] || '').startsWith('image'))?.['@_url'] || null,
  }));
  const atom = entries.map((e) => ({
    title: clean(text(e.title)),
    url: asArray(e.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'] || '',
    description: clean(text(e.summary || e.content), 150),
    pubDate: e.published || e.updated,
    thumbnail: e['media:thumbnail']?.['@_url'] || null,
  }));
  return [...rss, ...atom]
    .filter((a) => a.title && /^https?:\/\//.test(a.url))
    .map((a) => {
      const d = new Date(a.pubDate);
      return { ...a, source: source.name, pubDate: (isNaN(d) ? new Date() : d).toISOString() };
    });
}

async function loadSource(source, fetchImpl = fetch) {
  const hit = cache.get(source.url);
  if (hit && Date.now() - hit.at < FRESH_MS) return { articles: hit.articles, status: { name: source.name, ok: true, cached: true } };
  try {
    const res = await fetchImpl(source.url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'SentinelDashboard/1.0 (personal RSS reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const articles = parseFeed(await res.text(), source);
    if (!articles.length) throw new Error('no items in feed');
    cache.set(source.url, { at: Date.now(), articles });
    return { articles, status: { name: source.name, ok: true, cached: false } };
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'timed out' : err.message;
    if (hit && Date.now() - hit.at < STALE_MS) {
      return { articles: hit.articles, status: { name: source.name, ok: true, cached: true, stale: true, error: message } };
    }
    return { articles: [], status: { name: source.name, ok: false, error: message } };
  }
}

async function getNews(category, limit, fetchImpl) {
  const cats = category === 'all' ? CATEGORIES : [category];
  const perCat = await Promise.all(cats.map(async (cat) => {
    const results = await Promise.all(SOURCES[cat].map((s) => loadSource(s, fetchImpl)));
    const articles = results.flatMap((r) => r.articles.map((a) => ({ ...a, category: cat })))
      .sort((a, b) => b.pubDate.localeCompare(a.pubDate))
      .slice(0, category === 'all' ? Math.max(2, Math.ceil(limit / cats.length)) : limit);
    return { articles, sources: results.map((r) => r.status) };
  }));
  // de-duplicate by URL across sources, newest first
  const seen = new Set();
  const articles = perCat.flatMap((c) => c.articles)
    .filter((a) => (seen.has(a.url) ? false : seen.add(a.url)))
    .sort((a, b) => b.pubDate.localeCompare(a.pubDate))
    .slice(0, limit);
  return { articles, sources: perCat.flatMap((c) => c.sources) };
}

router.get('/api/news', async (req, res, next) => {
  try {
    const category = String(req.query.category || 'all');
    if (category !== 'all' && !SOURCES[category]) return res.status(400).json({ error: `unknown category "${category}"` });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const result = await getNews(category, limit);
    res.status(result.articles.length ? 200 : 502).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
module.exports._test = { parseFeed, getNews, cache, SOURCES };
