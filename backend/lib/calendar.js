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

// ---- writing ("add dinner Friday at 7") ----
// Needs the calendar.events permission: a Google login from before it was added gets a
// clear "reconnect" message instead of a raw 403.
let lastCreated = null;      // { calendarId, eventId, title } for "undo that"
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const SCOPE_HINT = "Alfred can't write to the calendar yet: open the Calendar widget, disconnect Google and connect it again (allow calendar access) so it includes permission to add events.";

// start: "2026-11-20T19:00" (local) or "2026-11-20" (all day)
async function createEvent({ title, start, durationMinutes = 60, calendar } = {}, { token, now = new Date() } = {}) {
  if (!title || !start) return 'I need a title and a date/time for the event.';
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(String(start).trim());
  const begin = allDay ? null : new Date(String(start).trim().replace(' ', 'T'));
  if (!allDay && Number.isNaN(begin?.getTime())) return `I couldn't read the time "${start}".`;
  if (!allDay && begin < new Date(now.getTime() - 3600e3)) return `That time (${begin.toLocaleString('en-US')}) is in the past.`;
  try {
    token = token || await googleToken();
    if (!token) return 'Google Calendar is not connected. Josh can connect it from the Calendar widget.';
    const headers = { Authorization: `Bearer ${token}` };
    let calendarId = 'primary';
    let calName = 'your calendar';
    if (calendar) {
      const { data } = await axios.get(`${API}/users/me/calendarList`, { headers });
      const writable = (data.items || []).filter((c) => ['owner', 'writer'].includes(c.accessRole));
      const hit = writable.find((c) => String(c.summary).toLowerCase().includes(String(calendar).toLowerCase()));
      if (!hit) return `I can't add to a calendar called "${calendar}" (writable: ${writable.map((c) => c.summary).join(', ') || 'none'}).`;
      calendarId = hit.id; calName = hit.summary;
    }
    let body;
    if (allDay) {
      const [y, m, d] = String(start).split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      body = { summary: title, start: { date: start }, end: { date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}` } };
    } else {
      const end = new Date(begin.getTime() + Math.max(5, Number(durationMinutes) || 60) * 60_000);
      body = { summary: title, start: { dateTime: localStamp(begin), timeZone: tz() }, end: { dateTime: localStamp(end), timeZone: tz() } };
    }
    const { data } = await axios.post(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, body, { headers });
    lastCreated = { calendarId, eventId: data.id, title };
    const when = allDay
      ? new Date(...String(start).split('-').map((n, i) => (i === 1 ? n - 1 : +n))).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ' (all day)'
      : begin.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `Added "${title}" to ${calName}: ${when}.`;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    if (err.response?.status === 403 || /insufficient|scope/i.test(msg)) return SCOPE_HINT;
    return `Couldn't add the event (${msg}).`;
  }
}

async function undoLast({ token } = {}) {
  if (!lastCreated) return "I haven't added any events recently.";
  try {
    token = token || await googleToken();
    await axios.delete(`${API}/calendars/${encodeURIComponent(lastCreated.calendarId)}/events/${encodeURIComponent(lastCreated.eventId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const { title } = lastCreated; lastCreated = null;
    return `Removed "${title}" from the calendar.`;
  } catch (err) {
    return `Couldn't remove it (${err.response?.data?.error?.message || err.message}).`;
  }
}

module.exports = { answer, events, windowFor, createEvent, undoLast };
