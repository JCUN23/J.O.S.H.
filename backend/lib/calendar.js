// Google Calendar for Sentinel (server side, from the login kept in data/tokens.json),
// so "what's on my calendar" works from the Pi mic with no browser involved. Same
// rules as the widget (src/utils/calendarApi.js): every calendar, all-day dates are
// local dates, events on two shared calendars count once.
const axios = require('axios');

const API = 'https://www.googleapis.com/calendar/v3';
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function parseWhen(when) {
  if (when?.dateTime) return { at: new Date(when.dateTime), allDay: false };
  const [y, m, d] = String(when?.date || '').split('-').map(Number);
  return { at: new Date(y, (m || 1) - 1, d || 1), allDay: true };
}

async function googleToken() {
  const { getValidToken } = require('./oauth');
  const { REFRESHERS } = require('../routes/auth');
  return (await getValidToken('google', REFRESHERS.google))?.access_token || null;
}

// -> [{ title, start: Date, allDay, calendar }] sorted, de-duplicated
async function events({ from, to, token }) {
  const headers = { Authorization: `Bearer ${token}` };
  const { data } = await axios.get(`${API}/users/me/calendarList`, { headers });
  const lists = await Promise.all((data.items || []).map(async (cal) => {
    try {
      const r = await axios.get(`${API}/calendars/${encodeURIComponent(cal.id)}/events`, {
        headers,
        params: { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 100 },
      });
      return (r.data.items || []).map((ev) => ({ ...ev, calendarName: cal.summary }));
    } catch { return []; }
  }));
  const seen = new Set();
  return lists.flat()
    .filter((ev) => { const k = `${ev.iCalUID || ev.id}|${ev.start?.dateTime || ev.start?.date}`; return seen.has(k) ? false : seen.add(k); })
    .map((ev) => { const s = parseWhen(ev.start); return { title: ev.summary || '(No title)', start: s.at, allDay: s.allDay, calendar: ev.calendarName }; })
    .sort((a, b) => a.start - b.start);
}

// when: today | tomorrow | weekend | week (default)
function windowFor(when, now) {
  const today = startOfDay(now);
  const w = String(when || 'week').toLowerCase();
  if (w.includes('tomorrow')) return [addDays(today, 1), addDays(today, 2), 'tomorrow'];
  if (w.includes('today') || w.includes('tonight')) return [today, addDays(today, 1), 'today'];
  if (w.includes('weekend')) {
    const toSat = (6 - today.getDay() + 7) % 7;
    const sat = addDays(today, today.getDay() === 0 ? -1 : toSat);
    return [sat < today ? today : sat, addDays(sat, 2), 'this weekend'];
  }
  return [today, addDays(today, 7), 'the next 7 days'];
}

const dayLabel = (d, now) => {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

async function answer(when, { now = new Date(), token } = {}) {
  try {
    token = token || await googleToken();
    if (!token) return 'Google Calendar is not connected. Josh can connect it from the Calendar widget.';
    const [from, to, label] = windowFor(when, now);
    const list = await events({ from, to, token });
    if (!list.length) return `Nothing on the calendar ${label}.`;
    const byDay = new Map();
    for (const e of list) {
      const day = dayLabel(e.start, now);
      const t = e.allDay ? 'all day' : e.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      byDay.set(day, [...(byDay.get(day) || []), `${e.title} (${t})`]);
    }
    return [...byDay].map(([d, items]) => `${d}: ${items.join(', ')}`).join('. ') + '.';
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return `Couldn't read the calendar (${msg}). Don't guess events.`;
  }
}

module.exports = { answer, events, windowFor };
