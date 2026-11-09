// Alfred's briefings: a short spoken rundown of the day (weather, calendar, games,
// reminders). Given:
//   - the first time the panel sees Josh in the morning (5 AM - noon), once a day
//   - the first time the panel sees him after he gets home (phone back on home Wi-Fi),
//     within 2 hours, so Alfred never talks to an empty office
//   - any time he asks ("brief me", "what's my day look like": get_briefing)
const path = require('path');
const { createJsonStore } = require('./jsonStore');

const store = createJsonStore(
  process.env.BRIEFING_STORE_PATH || path.join(__dirname, '..', 'data', 'briefing.json'),
  { label: 'Briefing' }
);
const WELCOME_WINDOW_MS = 2 * 3600_000;
const PART_TIMEOUT_MS = 6000;
let welcomeUntil = 0;

const dayKey = (d) => d.toDateString();
const partOfDay = (d) => (d.getHours() < 12 ? 'morning' : d.getHours() < 17 ? 'afternoon' : 'evening');
// A slow source (weather API, ESPN) must not hold up the rest
const within = (p) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), PART_TIMEOUT_MS))]);

// Default sources; tests inject their own
const SOURCES = {
  weather: () => require('./sentinel/executeTool').executeTool('get_weather', {}),
  calendar: () => require('./calendar').answer('today'),
  sports: () => require('./sports').answer('today'),
  reminders: () => require('./timers').list(),
};

async function compose(kind = 'ask', { now = new Date(), sources = SOURCES } = {}) {
  const [weather, calendar, sports, reminders] = await Promise.all([
    within(sources.weather()), within(sources.calendar()), within(sources.sports()), within(sources.reminders()),
  ]);
  const parts = [kind === 'welcome' ? 'Welcome home, Josh.' : `Good ${partOfDay(now)}, Josh.`];
  if (weather && !/couldn't|needs HOME_LAT|error/i.test(weather)) parts.push(weather.replace(/^Currently /, "It's ").replace(/ Feels like [^.]*\./, ''));
  if (calendar && !/not connected|couldn't/i.test(calendar)) {
    parts.push(/^Nothing/.test(calendar) ? 'Nothing on the calendar today.' : `On the calendar: ${calendar.replace(/^Today: /, '')}`);
  }
  if (sports && !/couldn't reach/i.test(sports)) {
    parts.push(/^None of/.test(sports) ? 'None of your teams play today.' : sports.replace(/^Today: /, 'Games: ').replace(/, today /g, ', '));
  }
  const today = (reminders || []).filter((t) => t.kind === 'reminder' && dayKey(new Date(t.dueAt)) === dayKey(now));
  if (today.length) {
    parts.push(`Reminders: ${today.map((t) => `${new Date(t.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${t.label}`).join(', ')}.`);
  }
  return parts.join(' ');
}

// Presence (lib/presence.js): Josh's phone just came home
function onPresence(e, now = Date.now()) {
  if (e?.event === 'arrive') welcomeUntil = now + WELCOME_WINDOW_MS;
  if (e?.event === 'leave' && e.everyoneGone) welcomeUntil = 0;
}

// The panel saw Josh (camera or tap after the idle screen). -> { text } | { skip: reason }
async function onArrived({ now = new Date(), sources } = {}) {
  if (process.env.BRIEFING === 'off') return { skip: 'briefings off' };
  if (now.getTime() < welcomeUntil) {
    welcomeUntil = 0;
    store.set('lastBriefing', dayKey(now));       // a welcome covers the morning one too
    return { text: await compose('welcome', { now, sources }) };
  }
  const h = now.getHours();
  if (h >= 5 && h < 12 && store.get('lastBriefing') !== dayKey(now)) {
    store.set('lastBriefing', dayKey(now));
    return { text: await compose('morning', { now, sources }) };
  }
  return { skip: 'already briefed / not morning' };
}

const _reset = () => { welcomeUntil = 0; store.clear('lastBriefing'); };

module.exports = { compose, onPresence, onArrived, _reset };
