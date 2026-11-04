// Stoic quote of the day. Normalizes to { quote, author } and never returns a bad shape:
// primary API -> secondary API -> built-in quotes. Length filtering happens here with a
// bounded number of attempts, instead of an unbounded while-loop in the browser.
const express = require('express');

const router = express.Router();

const MAX_LEN = 100;
const MAX_ATTEMPTS = 5;
const TIMEOUT_MS = 4000;

const PROVIDERS = [
  {
    name: 'tekloon',
    url: 'https://stoic.tekloon.net/stoic-quote',
    parse: (j) => ({ quote: j?.data?.quote, author: j?.data?.author }),
  },
  {
    name: 'stoic-quotes.com',
    url: 'https://stoic-quotes.com/api/quote',
    parse: (j) => ({ quote: j?.text, author: j?.author }),
  },
];

const FALLBACK_QUOTES = [
  { quote: 'Waste no more time arguing what a good man should be. Be one.', author: 'Marcus Aurelius' },
  { quote: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { quote: 'No man is free who is not master of himself.', author: 'Epictetus' },
];

const clean = (s) => String(s).replace(/[\r\n]+@?/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchQuote(provider) {
  const res = await fetch(provider.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${provider.name} HTTP ${res.status}`);
  const { quote, author } = provider.parse(await res.json());
  if (typeof quote !== 'string' || typeof author !== 'string' || !quote.trim() || !author.trim()) {
    throw new Error(`${provider.name} returned an unexpected shape`);
  }
  return { quote: clean(quote), author: clean(author), source: provider.name };
}

router.get('/api/stoic', async (req, res) => {
  for (const provider of PROVIDERS) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const q = await fetchQuote(provider);
        if (q.quote.length <= MAX_LEN) return res.json(q);
      } catch (err) {
        console.warn(`Quote provider failed (${err.message}); trying next`);
        break; // provider is down or broken; don't hammer it, move on
      }
    }
  }
  const q = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  res.json({ ...q, source: 'fallback' });
});

module.exports = router;
