// Live game alerts for the followed teams: scores (football, soccer), halftime and
// finals, spoken on the voice panel and pushed to the phone.
//   "Touchdown Lions! Lions 21, Packers 10."  "Halftime: Lions 14, Packers 10."
//   "Final: Lions 27, Packers 20. The Lions win!"
// Polls only while a followed team has a game live or about to start, with fresh
// scoreboards (the sports module's 5-minute cache is too slow for live scores).
// A game seen for the first time (e.g. after a restart) is recorded without alerts.
// Off: GAME_ALERTS=off, or mute the ntfy category "game".
const { TEAMS } = require('./teams');
const sports = require('./sports');

const games = new Map();      // event id -> { us, them, half, final }
let timer = null;

const nameOf = (c) => c?.team?.shortDisplayName || c?.team?.displayName || 'They';
const scoreOf = (c) => Number(typeof c?.score === 'object' ? (c.score?.value ?? c.score?.displayValue) : c?.score) || 0;

function scoreWord(sport, points) {
  if (sport === 'soccer') return 'Goal';
  if (points >= 6) return 'Touchdown';
  if (points === 3) return 'Field goal';
  if (points === 2) return 'Two points for';
  return null;                                 // extra point alone: not worth a shout
}

// One fresh scoreboard snapshot of an event -> lines to say (and updates what we know)
function update(team, league, event) {
  const comp = event.competitions?.[0] || {};
  const status = comp.status?.type || event.status?.type || {};
  const us = (comp.competitors || []).find((c) => String(c.team?.id ?? c.id) === String(league.id));
  const them = (comp.competitors || []).find((c) => c !== us);
  if (!us || !them) return [];
  const sport = league.path.split('/')[0];
  const u = scoreOf(us), t = scoreOf(them);
  const U = nameOf(us), Th = nameOf(them);
  const line = `${U} ${u}, ${Th} ${t}`;
  const key = String(event.id);
  const isHalf = status.name === 'STATUS_HALFTIME';
  const isFinal = status.state === 'post';
  const prev = games.get(key);
  games.set(key, { us: u, them: t, half: (prev?.half || isHalf), final: (prev?.final || isFinal) });
  if (!prev || status.state === 'pre') return [];   // first sight: just record it

  if (isFinal && !prev.final) {
    const verdict = u > t ? `The ${U} win!` : u < t ? `The ${U} lose.` : "It's a tie.";
    return [`Final: ${line}. ${verdict}`];
  }
  const out = [];
  if (sport !== 'basketball') {
    if (u > prev.us) { const w = scoreWord(sport, u - prev.us); if (w) out.push(`${w} ${U}! ${line}.`); }
    if (t > prev.them) { const w = scoreWord(sport, t - prev.them); if (w) out.push(`${Th} ${w === 'Goal' ? 'score' : w.toLowerCase()}. ${line}.`); }
  }
  if (isHalf && !prev.half) out.push(`Halftime: ${line}.`);
  return out;
}

async function freshScoreboards(league, now, fetchImpl) {
  const day = sports.dayKey(now);
  const paths = [league.path, ...(sports.SCOREBOARD_EXTRA[league.path] || [])];
  const lists = await Promise.all(paths.map(async (p) => {
    try {
      const res = await fetchImpl(`${sports.ESPN}/${p}/scoreboard?dates=${day}${sports.SCOREBOARD_PARAMS[p] || ''}`, { signal: AbortSignal.timeout(8000) });
      return res.ok ? (await res.json())?.events || [] : [];
    } catch { return []; }
  }));
  return lists.flat().filter((e) => sports.involves(e, league.id));
}

async function tick(now = new Date(), { fetchImpl = fetch, say = announce } = {}) {
  if (process.env.GAME_ALERTS === 'off') return [];
  const said = [];
  for (const team of TEAMS) {
    const league = sports.leagueOf(team);
    if (!league) continue;
    let today;
    try { today = await sports.gamesOn(team, now, fetchImpl); } catch { continue; }
    // Live, about to start (10 min), or one we're following that hasn't been called final
    const worth = today.some((e) => {
      const known = games.get(String(e.id));
      return new Date(e.date) - now < 10 * 60_000 && !known?.final;
    });
    if (!worth) continue;
    for (const e of await freshScoreboards(league, now, fetchImpl)) {
      for (const text of update(team, league, e)) { said.push(text); await say(text, team); }
    }
  }
  return said;
}

async function announce(text) {
  try { require('../routes/voice').announce(text, 'gameAlerts'); } catch { /* no panel */ }
  require('./notify').notify({ title: text.split(/[.!:]/)[0], message: text, category: 'game', priority: 3, tags: ['sports_medal'] });
}

function start({ intervalMs = Number(process.env.GAME_ALERTS_INTERVAL_MS) || 60_000 } = {}) {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.warn('Game alerts:', e.message)), intervalMs);
  timer.unref?.();
}

const _reset = () => games.clear();
module.exports = { tick, update, start, _reset };
