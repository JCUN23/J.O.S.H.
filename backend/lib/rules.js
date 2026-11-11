// Rules: "when X, do Y". Triggers:
//   { type: 'time', at: 'HH:MM', days?: [0-6] }            (0 = Sunday, local time)
//   { type: 'sun', event: 'sunset'|'sunrise', offsetMin?, days? }  (needs HOME_LAT/HOME_LON)
//   { type: 'presence', event: 'arrive'|'leave', who: 'anyone'|'everyone'|<person id> }
// Optional conditions: { dark: true } = only between sunset and sunrise.
// Action: { scene: '<scene id>' } or { actions: [...] }.
// Each rule fires at most once per day. A trigger missed by more than CATCH_UP_MS
// (backend was down, or the host was asleep) is skipped rather than firing hours late,
// and the skip is written to the activity log so it never fails silently.
const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { sunTimes } = require('./sun');
const scenes = require('./scenes');
const { runActions } = require('./actions');
const activity = require('./activity');
const { notify } = require('./notify');

const CATCH_UP_MS = 10 * 60 * 1000;
const PAUSE_NOTICE_MS = 5 * 60 * 1000;      // scheduler gap worth reporting (host slept)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Seeded DISABLED: rules act on the house unattended, so you opt in per rule.
const DEFAULT_RULES = [
  { id: 'sunset-relax', name: 'Relax lighting at sunset', enabled: false,
    trigger: { type: 'sun', event: 'sunset', offsetMin: 0 }, action: { scene: 'relax' } },
  { id: 'weeknight-goodnight', name: 'Goodnight on school nights', enabled: false,
    trigger: { type: 'time', at: '23:30', days: [0, 1, 2, 3, 4] }, action: { scene: 'goodnight' } },
  // id kept from when this was Focus (changing it would duplicate the rule on old installs)
  { id: 'weekday-focus', name: 'Relax lighting on weekday mornings', enabled: false,
    trigger: { type: 'time', at: '08:30', days: [1, 2, 3, 4, 5] }, action: { scene: 'relax' } },
  { id: 'arrive-after-dark', name: 'Lights on when someone gets home after dark', enabled: false,
    trigger: { type: 'presence', event: 'arrive', who: 'anyone' }, conditions: { dark: true }, action: { scene: 'relax' } },
  { id: 'everyone-left', name: 'Everything off when everyone leaves', enabled: false,
    trigger: { type: 'presence', event: 'leave', who: 'everyone' }, action: { scene: 'all-off' } },
];
const PRESENCE_COOLDOWN_MS = 10 * 60 * 1000;   // a flapping phone can't strobe the lights

const store = createJsonStore(
  process.env.RULES_STORE_PATH || path.join(__dirname, '..', 'data', 'rules.json'),
  { label: 'Rule store' }
);

const home = () => {
  const lat = parseFloat(process.env.HOME_LAT); const lon = parseFloat(process.env.HOME_LON);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

// One-time changes to rules already saved on an install. Each runs once (flagged), and
// only touches a rule nobody has edited, so it never undoes Josh's own changes.
const MIGRATIONS = [
  // Nov 11: Josh wants Relax, not Focus, on weekday mornings
  { id: 'weekday-morning-relax', run: (rules) => rules.map((r) => (r.id === 'weekday-focus' && r.action?.scene === 'focus'
    ? { ...r, name: 'Relax lighting on weekday mornings', action: { ...r.action, scene: 'relax' } } : r)) },
];

function list() {
  let rules = store.get('rules');
  if (!rules) { rules = DEFAULT_RULES; store.set('rules', rules); }
  const done = store.get('migrations') || [];
  const todo = MIGRATIONS.filter((m) => !done.includes(m.id));
  if (todo.length) {
    for (const m of todo) rules = m.run(rules);
    store.set('rules', rules);
    store.set('migrations', [...done, ...todo.map((m) => m.id)]);
  }
  // Rules added in later versions show up (disabled) on installs that predate them.
  const missing = DEFAULT_RULES.filter((d) => !rules.some((r) => r.id === d.id));
  if (missing.length) { rules = [...rules, ...missing]; store.set('rules', rules); }
  return rules;
}
const get = (id) => list().find((r) => r.id === id) || null;

// Point a rule at a different scene. The rule's name follows when it mentions the old
// scene ("Focus lighting on weekday mornings" -> "Relax lighting on weekday mornings").
function setScene(id, sceneQuery) {
  const scene = scenes.find(sceneQuery);
  if (!scene) return { error: `No scene called "${sceneQuery}". Scenes: ${scenes.list().map((s) => s.name).join(', ')}.` };
  const rule = get(id);
  if (!rule) return { error: `No rule "${id}"` };
  const old = scenes.list().find((s) => s.id === rule.action?.scene);
  const name = old ? rule.name.replace(new RegExp(old.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), scene.name) : rule.name;
  const updated = { ...rule, name, action: { scene: scene.id } };
  store.set('rules', list().map((r) => (r.id === id ? updated : r)));
  return { rule: updated, from: old?.name || rule.action?.scene || 'custom actions', to: scene.name };
}

function setEnabled(id, enabled) {
  const rules = list().map((r) => (r.id === id ? { ...r, enabled: Boolean(enabled) } : r));
  store.set('rules', rules);
  return rules.find((r) => r.id === id) || null;
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// When does this rule's trigger happen on the day of `now`? null = not today / can't compute.
function triggerTimeToday(rule, now) {
  const t = rule.trigger || {};
  if (Array.isArray(t.days) && !t.days.includes(now.getDay())) return null;
  if (t.type === 'time') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.at || '');
    if (!m) return null;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]));
  }
  if (t.type === 'sun') {
    const loc = home();
    if (!loc) return null;
    const base = sunTimes(now, loc.lat, loc.lon)[t.event === 'sunrise' ? 'sunrise' : 'sunset'];
    return base ? new Date(base.getTime() + (Number(t.offsetMin) || 0) * 60000) : null;
  }
  return null;
}

const clock = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// Between sunset and sunrise? Without HOME_LAT/LON, treat it as "dark" after 5 PM / before 7 AM.
function isDark(now = new Date()) {
  const loc = home();
  if (!loc) return now.getHours() >= 17 || now.getHours() < 7;
  const t = sunTimes(now, loc.lat, loc.lon);
  return !(t.sunrise && t.sunset) || now < t.sunrise || now > t.sunset;
}
const conditionsMet = (rule, now) => !rule.conditions?.dark || isDark(now);

const duration = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

// Human description for the UI: "11:30 PM, Sun–Thu", "Sunset (5:17 PM today)"
function describeTrigger(rule, now = new Date()) {
  const t = rule.trigger || {};
  const days = Array.isArray(t.days) && t.days.length < 7
    ? `, ${t.days.map((d) => DAY_NAMES[d]).join(' ')}` : ', every day';
  if (t.type === 'time') {
    const [h, m] = (t.at || '0:00').split(':').map(Number);
    return `${clock(new Date(2000, 0, 1, h, m))}${days}`;
  }
  const dark = rule.conditions?.dark ? ', after dark' : '';
  if (t.type === 'presence') {
    const who = t.who === 'everyone' ? 'everyone' : t.who === 'anyone' || !t.who ? 'anyone' : t.who;
    if (t.event === 'leave') return `When ${who === 'everyone' ? 'the last person leaves' : `${who} leaves`}${dark}`;
    return `When ${who === 'anyone' ? 'someone' : who} gets home${dark}`;
  }
  if (t.type === 'sun') {
    const off = Number(t.offsetMin) || 0;
    const label = `${t.event === 'sunrise' ? 'Sunrise' : 'Sunset'}${off ? ` ${off > 0 ? '+' : '−'}${Math.abs(off)} min` : ''}`;
    if (!home()) return `${label}${days} (set HOME_LAT/HOME_LON)`;
    const today = triggerTimeToday({ trigger: { ...t, days: undefined } }, now);
    return `${label}${days}${today ? ` (${clock(today)} today)` : ''}`;
  }
  return 'unknown trigger';
}

async function fire(rule, { source = 'rule', reason } = {}) {
  let r;
  if (rule.action?.scene) {
    const scene = scenes.find(rule.action.scene);
    r = scene ? await scenes.activate(scene, { source, reason: reason || `Rule: ${rule.name}` })
      : activity.log({ source, title: `Rule: ${rule.name}`, results: [`error: scene "${rule.action.scene}" not found`] });
  } else {
    r = activity.log({ source, title: `Rule: ${rule.name}`, results: await runActions(rule.action?.actions || []), detail: reason });
  }
  if (r && r.ok === false && source === 'rule') {          // unattended run went wrong: tell someone
    const failed = (r.results || []).filter((x) => /error|not |missed|0\/[1-9]/i.test(x));
    notify({ title: `Rule partly failed: ${rule.name}`, message: failed.join('\n') || 'see Activity', category: 'rules', priority: 3, tags: ['warning'] });
  }
  return r;
}

// Presence events from lib/presence.js
const lastPresenceFire = {};
async function handlePresence({ event, person, firstHome, everyoneGone }, now = new Date()) {
  const ran = [];
  for (const rule of list()) {
    const t = rule.trigger || {};
    if (!rule.enabled || t.type !== 'presence' || t.event !== event) continue;
    const who = t.who || 'anyone';
    const match = who === 'anyone' || who === person.id || (who === 'everyone' && everyoneGone)
      || (who === 'first' && firstHome);
    if (!match || !conditionsMet(rule, now)) continue;
    if (now - (lastPresenceFire[rule.id] || 0) < PRESENCE_COOLDOWN_MS) continue;
    lastPresenceFire[rule.id] = now.getTime();
    ran.push(rule.id);
    await fire(rule, { reason: `Rule: ${rule.name} (${person.name} ${event === 'arrive' ? 'got home' : 'left'})` });
  }
  return ran;
}

// One scheduler pass. Exported for tests; `now` injectable.
// `since` = when the previous pass ran. With it, tick can tell "the scheduler was
// frozen (laptop asleep) while this rule was due" apart from "rule was enabled after
// its time today", and logs the former instead of skipping quietly.
async function tick(now = new Date(), { since } = {}) {
  const fired = store.get('fired') || {};
  const today = dayKey(now);
  const ran = [];
  if (since && now - since > PAUSE_NOTICE_MS) {
    activity.log({ source: 'system', title: `Scheduler paused for ${duration(now - since)}`,
      results: [`no rule checks from ${clock(since)} to ${clock(now)} (host asleep or frozen?)`] });
  }
  for (const rule of list()) {
    if (!rule.enabled || fired[rule.id] === today) continue;
    const at = triggerTimeToday(rule, now);
    if (!at) continue;
    const late = now - at;
    if (late < 0 || !conditionsMet(rule, now)) continue;
    if (late > CATCH_UP_MS) {
      if (since && at > since) {
        fired[rule.id] = today;
        store.set('fired', fired);
        activity.log({ source: 'rule', title: `Skipped: ${rule.name}`,
          results: [`missed: due ${clock(at)}, scheduler was paused until ${clock(now)}`] });
      }
      continue;
    }
    fired[rule.id] = today;
    store.set('fired', fired);                 // record BEFORE acting: never double-fire
    ran.push(rule.id);
    try { await fire(rule, { reason: `Rule: ${rule.name} (${describeTrigger(rule, now)})` }); }
    catch (err) { activity.log({ source: 'rule', title: `Rule: ${rule.name}`, results: [`error: ${err.message}`] }); }
  }
  return ran;
}

let timer = null;
function startScheduler({ intervalMs = 30_000 } = {}) {
  if (timer) return;
  list();                                       // seed defaults on first run
  let lastTick = null;
  timer = setInterval(() => {
    const now = new Date();
    const since = lastTick;
    lastTick = now;
    tick(now, { since }).catch((e) => console.warn('Rule scheduler error:', e.message));
  }, intervalMs);
  timer.unref?.();
  console.log(`Rule scheduler on (every ${intervalMs / 1000}s)${home() ? '' : ' (sun rules off: set HOME_LAT/HOME_LON)'}`);
}

module.exports = { _store: store, list, get, setEnabled, setScene, fire, tick, handlePresence, isDark, triggerTimeToday, describeTrigger, startScheduler, DEFAULT_RULES };
