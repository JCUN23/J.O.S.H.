// Alfred's long-term memory: facts and preferences Josh asks him to keep ("remember I
// like the lights at 40% after 9", "my mom's birthday is March 3"). Saved to
// data/memory.json and put into every request's system prompt, so they shape answers
// from then on. Only what Josh explicitly asks to remember goes in.
const path = require('path');
const { createJsonStore } = require('../jsonStore');

const store = createJsonStore(
  process.env.MEMORY_STORE_PATH || path.join(__dirname, '..', '..', 'data', 'memory.json'),
  { label: 'Alfred memory' }
);
const MAX_FACTS = 40;
const MAX_LEN = 200;
const facts = () => store.get('facts') || [];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function remember(text, now = Date.now()) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
  if (!t) return 'What should I remember?';
  const list = facts();
  if (list.some((f) => norm(f.text) === norm(t))) return 'I already have that.';
  if (list.length >= MAX_FACTS) return `My memory is full (${MAX_FACTS} things). Ask me to forget something first.`;
  store.set('facts', [...list, { id: now.toString(36), text: t, at: new Date(now).toISOString() }]);
  return `I'll remember that: ${t}`;
}

// about: words to match ("lights", "mom's birthday"); "everything"/"all" clears it
function forget(about) {
  const q = norm(about);
  const list = facts();
  if (!list.length) return "There's nothing in my memory.";
  if (!q) return 'What should I forget?';
  if (q === 'everything' || q === 'all') { store.set('facts', []); return `Forgotten: all ${list.length} things.`; }
  const words = q.split(' ').filter((w) => w.length > 2);
  const hit = list.filter((f) => { const n = norm(f.text); return n.includes(q) || (words.length && words.every((w) => n.includes(w))); });
  if (!hit.length) return `I don't have anything about "${about}".`;
  store.set('facts', list.filter((f) => !hit.includes(f)));
  return `Forgotten: ${hit.map((f) => f.text).join('; ')}.`;
}

function list() {
  const all = facts();
  return all.length ? all.map((f) => f.text).join('; ') + '.' : "I'm not keeping anything in long-term memory yet.";
}

// For the system prompt
function promptBlock() {
  const all = facts();
  if (!all.length) return '';
  return `\n\nThings Josh asked you to remember (use them whenever relevant; they override defaults):\n${all.map((f) => `- ${f.text}`).join('\n')}`;
}

module.exports = { remember, forget, list, promptBlock };
