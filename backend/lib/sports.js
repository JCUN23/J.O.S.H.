// Sports answers for Sentinel, from ESPN's public site API (same source as the Sports
// widget and Game Day). Built around the teams Josh follows (lib/teams.js), and always
// filtered to the right DATE with real start times, so the AI never has to guess.
// (Nov 8: "what games are on today" got three games from the wrong day, no times, and
// the model invented the rest.)
const { TEAMS, findTeam } = require('./teams');

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const LEAGUES = [
  { re: /\bnfl\b|pro football/, path: 'football/nfl', label: 'NFL' },
  { re: /\bnba\b|pro basketball/, path: 'basketball/nba', label: 'NBA' },
  { re: /college football|\bcfb\b|ncaa football/, path: 'football/college-football', label: 'college football' },
  { re: /college basketball|ncaa basketball|march madness/, path: 'basketball/mens-college-basketball', label: "men's college basketball" },
  { re: /la liga|laliga|spanish league/, path: 'soccer/esp.1', label: 'La Liga' },
  { re: /\bnhl\b|hockey/, path: 'hockey/nhl', label: 'NHL' },
  { re: /\bmlb\b|baseball/, path: 'baseball/mlb', label: 'MLB' },
];

const cache = new Map();   // url -> { at, data }
async function getJson(url, fetchImpl) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  return data;
}

const dayKey = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayName = (d, now) => {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};
// Schedules give { value, displayValue }; scoreboards give a string. Accept both.
const score = (c) => (typeof c?.score === 'object' ? (c.score?.displayValue ?? c.score?.value) : c?.score) ?? '';
const networks = (comp) => [...new Set((comp?.broadcasts || []).flatMap((b) =>
  [b.media?.shortName, ...(Array.isArray(b.names) ? b.names : [])]).filter(Boolean))];

// One game, one line: upcoming has time + network, live has score + clock, final has score.
function describe(event, now) {
  const comp = event.competitions?.[0] || {};
  const home = (comp.competitors || []).find((c) => c.homeAway === 'home') || {};
  const away = (comp.competitors || []).find((c) => c.homeAway === 'away') || {};
  const name = (c) => c.team?.shortDisplayName || c.team?.displayName || '?';
  const state = comp.status?.type?.state || event.status?.type?.state;
  const detail = comp.status?.type?.shortDetail || event.status?.type?.shortDetail || '';
  const when = new Date(event.date);
  if (state === 'in') return `LIVE: ${name(away)} ${score(away)}, ${name(home)} ${score(home)} (${detail})`;
  if (state === 'post') return `Final: ${name(away)} ${score(away)}, ${name(home)} ${score(home)}`;
  const tv = networks(comp);
  return `${name(away)} at ${name(home)}, ${dayName(when, now)} ${clock(when)}${tv.length ? ` on ${tv.join(' / ')}` : ''}`;
}

async function teamSchedule(team, fetchImpl) {
  return (await getJson(team.scheduleUrl, fetchImpl))?.events || [];
}

async function teamAnswer(team, now, fetchImpl) {
  const events = await teamSchedule(team, fetchImpl);
  const today = dayKey(now);
  const todays = events.filter((e) => dayKey(new Date(e.date)) === today);
  if (todays.length) return `${team.name}: ${todays.map((e) => describe(e, now)).join('; ')}`;
  const next = events.find((e) => new Date(e.date) > now && (e.competitions?.[0]?.status?.type?.state || 'pre') === 'pre');
  const last = [...events].reverse().find((e) => e.competitions?.[0]?.status?.type?.state === 'post');
  const parts = [`${team.name} don't play today.`];
  if (next) parts.push(`Next: ${describe(next, now)}.`);
  if (last) parts.push(`Last: ${describe(last, now)}.`);
  return parts.join(' ');
}

async function leagueToday(league, now, fetchImpl) {
  const data = await getJson(`${ESPN}/${league.path}/scoreboard?dates=${dayKey(now)}`, fetchImpl);
  const events = (data?.events || []).filter((e) => dayKey(new Date(e.date)) === dayKey(now));
  if (!events.length) return `No ${league.label} games today.`;
  const lines = events.slice(0, 8).map((e) => describe(e, now));
  return `${league.label} today (${events.length}): ${lines.join('; ')}${events.length > 8 ? '; ...' : ''}`;
}

// query: whatever the model asked ("games today", "Lions score", "NBA tonight")
async function answer(query = '', { now = new Date(), fetchImpl = fetch } = {}) {
  const q = String(query).toLowerCase();
  try {
    const team = findTeam(q) || TEAMS.find((t) => [t.name, ...t.aliases].some((a) => q.includes(a.toLowerCase())));
    if (team) return await teamAnswer(team, now, fetchImpl);
    const league = LEAGUES.find((l) => l.re.test(q));
    if (league) return await leagueToday(league, now, fetchImpl);
    // No team or league named: today's games for every followed team
    const today = dayKey(now);
    const lines = [];
    const nexts = [];
    for (const t of TEAMS) {
      try {
        const events = await teamSchedule(t, fetchImpl);
        for (const e of events.filter((ev) => dayKey(new Date(ev.date)) === today)) lines.push(`${t.name}: ${describe(e, now)}`);
        const next = events.find((e) => new Date(e.date) > now && dayKey(new Date(e.date)) !== today);
        if (next) nexts.push({ t, e: next });
      } catch { /* one team's feed failing shouldn't sink the answer */ }
    }
    if (lines.length) return `Today: ${lines.join('; ')}`;
    nexts.sort((a, b) => new Date(a.e.date) - new Date(b.e.date));
    return `None of Josh's teams (${TEAMS.map((t) => t.name).join(', ')}) play today.${nexts[0] ? ` Next up: ${nexts[0].t.name}, ${describe(nexts[0].e, now)}.` : ''}`;
  } catch (err) {
    return `Couldn't reach ESPN for sports info (${err.message}). Don't guess scores or times.`;
  }
}

const _clearCache = () => cache.clear();
module.exports = { answer, describe, _clearCache };
