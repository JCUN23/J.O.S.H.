// Alfred's short-term memory: the last few exchanges, so follow-ups work ("turn on the
// lights" ... "make them blue", "what about tomorrow?"). One conversation for the house,
// shared by the panel and the Pi mic. It forgets after a few quiet minutes, so an old
// topic never leaks into a new request. Kept in memory only (a restart forgets).
const opt = () => ({
  turns: Number(process.env.SENTINEL_MEMORY_TURNS ?? 3),            // exchanges kept
  idleMs: Number(process.env.SENTINEL_MEMORY_MINUTES ?? 5) * 60_000, // forget after this much quiet
});
let history = [];       // [{ role, content }]
let lastAt = 0;

// Messages to put between the system prompt and the new request
function recent(now = Date.now()) {
  if (now - lastAt > opt().idleMs) history = [];
  return history.map((m) => ({ ...m }));
}

function remember(userText, reply, now = Date.now()) {
  if (now - lastAt > opt().idleMs) history = [];
  const clip = (s) => String(s || '').slice(0, 400);
  history.push({ role: 'user', content: clip(userText) }, { role: 'assistant', content: clip(reply) });
  history = history.slice(-opt().turns * 2);
  lastAt = now;
}

const forget = () => { history = []; lastAt = 0; };

module.exports = { recent, remember, forget };
