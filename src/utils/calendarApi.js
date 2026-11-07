import { BACKEND_URL } from '../config';
import { getProviderToken } from './authApi';

export const CALENDAR_SCOPE_MISSING = "Google didn't grant calendar access. Connect again and tick the \u201cSee and download any calendar\u201d box on Google's permission screen.";

// Google Calendar Functions
// Tokens live on the server (see utils/authApi.js); these helpers just ask for one.
export async function startGoogleAuth() {
    window.location.href = `${BACKEND_URL}/auth/google`;
}

export async function exchangeGoogleToken(code) {
    const response = await fetch(`${BACKEND_URL}/auth/google/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Google sign-in failed (HTTP ${response.status})`);
    return data.access_token;
}

export async function getGoogleToken() {
    const t = await getProviderToken('google');
    if (!t) throw new Error('Google Calendar not connected');
    return t.access_token;
}

export const CALENDAR_DAYS = 7;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Google sends all-day events as a bare date ("2026-11-07"). new Date() reads that as UTC
// midnight, which in Detroit is 7 PM the day before. Parse it as a LOCAL date instead.
function parseWhen(when) {
    if (when?.dateTime) return { at: new Date(when.dateTime), allDay: false };
    const [y, m, d] = String(when?.date || '').split('-').map(Number);
    return { at: new Date(y, (m || 1) - 1, d || 1), allDay: true };
}

const WEEKDAY = { weekday: 'short' };
function dayLabel(date, today) {
    const diff = Math.round((startOfDay(date) - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// Raw Google events (any calendars) -> sorted, de-duplicated rows for the widget.
// Exported for tests; `now` injectable.
export function formatEvents(raw, now = new Date()) {
    const today = startOfDay(now);
    const seen = new Set();
    const rows = [];
    for (const ev of raw) {
        const key = `${ev.iCalUID || ev.id}|${ev.start?.dateTime || ev.start?.date}`;
        if (seen.has(key)) continue;                      // same event on two (shared) calendars
        seen.add(key);
        const start = parseWhen(ev.start);
        const end = parseWhen(ev.end);
        const ongoing = start.at < today;                 // started before today, still running
        let time;
        if (start.allDay) {
            const lastDay = addDays(end.at, -1);          // all-day end dates are exclusive
            const multi = lastDay > start.at;
            time = multi ? `All day · thru ${lastDay.toLocaleDateString('en-US', WEEKDAY)}` : 'All day';
        } else {
            time = start.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        const shown = ongoing ? today : start.at;
        rows.push({
            title: ev.summary || '(No title)',
            time,
            allDay: start.allDay,
            sortAt: ongoing ? today.getTime() - 1 : start.at.getTime() - (start.allDay ? 1 : 0),
            day: ongoing ? 'Today' : dayLabel(shown, today),
            dayKey: startOfDay(shown).toISOString(),
            ongoing,
            calendar: ev.calendarName || 'Google',
            color: ev.calendarColor || 'blue',
        });
    }
    return rows.sort((a, b) => a.sortAt - b.sortAt);
}

export async function getGoogleCalendarEvents() {
    const token = await getGoogleToken();
    const from = startOfDay(new Date());
    const to = addDays(from, CALENDAR_DAYS);

    // First, get list of all calendars
    const calendarsResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const calendarsData = await calendarsResponse.json();

    if (calendarsData.error) {
        // A login made with the calendar box unticked: say what to do, not "403"
        if (calendarsData.error.status === 'PERMISSION_DENIED' || /insufficient authentication scopes/i.test(calendarsData.error.message || '')) {
            throw Object.assign(new Error(CALENDAR_SCOPE_MISSING), { code: 'calendar_scope_missing' });
        }
        throw new Error(calendarsData.error.message || 'Failed to fetch calendars');
    }

    // Every calendar's events for the window, in parallel
    const perCalendar = await Promise.all((calendarsData.items || []).map(async (calendar) => {
        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${new URLSearchParams({
                    timeMin: from.toISOString(),
                    timeMax: to.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 100
                })}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await response.json();
            return (data.items || []).map((event) => ({ ...event, calendarName: calendar.summary, calendarColor: calendar.backgroundColor }));
        } catch (err) {
            console.warn(`Failed to fetch events from ${calendar.summary}:`, err);
            return [];
        }
    }));

    return formatEvents(perCalendar.flat());
}

// Microsoft Calendar Functions
export async function startMicrosoftAuth() {
    window.location.href = `${BACKEND_URL}/auth/microsoft`;
}

export async function exchangeMicrosoftToken(code) {
    const response = await fetch(`${BACKEND_URL}/auth/microsoft/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    if (!response.ok) throw new Error(`Microsoft sign-in failed (HTTP ${response.status})`);
    return (await response.json()).access_token;
}

export async function getMicrosoftToken() {
    const t = await getProviderToken('microsoft');
    if (!t) throw new Error('Microsoft Calendar not connected');
    return t.access_token;
}

export async function getMicrosoftCalendarEvents() {
    const token = await getMicrosoftToken();

    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59);

    const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?${new URLSearchParams({
            startDateTime: now.toISOString(),
            endDateTime: endOfDay.toISOString(),
            $orderby: 'start/dateTime',
            $top: 10
        })}`,
        {
            headers: { Authorization: `Bearer ${token}` }
        }
    );

    const data = await response.json();

    return data.value?.map(event => ({
        title: event.subject,
        time: new Date(event.start.dateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        }),
        calendar: 'Outlook',
        color: 'purple'
    })) || [];
}