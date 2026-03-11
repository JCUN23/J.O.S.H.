const BACKEND_URL = 'http://127.0.0.1:3001';

// Google Calendar Functions
export async function startGoogleAuth() {
    window.location.href = `${BACKEND_URL}/auth/google`;
}

export async function exchangeGoogleToken(code) {
    const response = await fetch(`${BACKEND_URL}/auth/google/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });

    const data = await response.json();

    localStorage.setItem('google_access_token', data.access_token);
    localStorage.setItem('google_refresh_token', data.refresh_token);
    localStorage.setItem('google_expires_at', Date.now() + data.expires_in * 1000);

    return data.access_token;
}

export async function refreshGoogleToken() {
    const refreshToken = localStorage.getItem('google_refresh_token');

    const response = await fetch(`${BACKEND_URL}/auth/google/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await response.json();

    localStorage.setItem('google_access_token', data.access_token);
    localStorage.setItem('google_expires_at', Date.now() + data.expires_in * 1000);

    return data.access_token;
}

export async function getGoogleToken() {
    const expiresAt = Number(localStorage.getItem('google_expires_at'));

    if (Date.now() < expiresAt - 60000) {
        return localStorage.getItem('google_access_token');
    }

    return await refreshGoogleToken();
}

export async function getGoogleCalendarEvents() {
    const token = await getGoogleToken();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date();
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);

    // First, get list of all calendars
    const calendarsResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        { headers: { Authorization: `Bearer ${token}` } }
    );
    const calendarsData = await calendarsResponse.json();

    if (calendarsData.error) {
        throw new Error(calendarsData.error.message || 'Failed to fetch calendars');
    }

    console.log('Google Calendars:', calendarsData.items?.map(c => c.summary));

    // Fetch events from all calendars
    const allEvents = [];
    for (const calendar of calendarsData.items || []) {
        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${new URLSearchParams({
                    timeMin: startOfDay.toISOString(),
                    timeMax: endOfTomorrow.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 10
                })}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = await response.json();

            if (data.items) {
                data.items.forEach(event => {
                    allEvents.push({
                        ...event,
                        calendarName: calendar.summary,
                        calendarColor: calendar.backgroundColor
                    });
                });
            }
        } catch (err) {
            console.warn(`Failed to fetch events from ${calendar.summary}:`, err);
        }
    }

    console.log('All events:', allEvents);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Sort by start time
    allEvents.sort((a, b) => {
        const aTime = new Date(a.start.dateTime || a.start.date);
        const bTime = new Date(b.start.dateTime || b.start.date);
        return aTime - bTime;
    });

    return allEvents.map(event => {
        const eventDate = new Date(event.start.dateTime || event.start.date);
        const isToday = eventDate >= today && eventDate < tomorrow;

        return {
            title: event.summary || '(No title)',
            time: new Date(event.start.dateTime || event.start.date).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
            }),
            day: isToday ? 'Today' : 'Tomorrow',
            calendar: event.calendarName || 'Google',
            color: event.calendarColor || 'blue'
        };
    });
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

    const data = await response.json();

    localStorage.setItem('microsoft_access_token', data.access_token);
    localStorage.setItem('microsoft_refresh_token', data.refresh_token);
    localStorage.setItem('microsoft_expires_at', Date.now() + data.expires_in * 1000);

    return data.access_token;
}

export async function refreshMicrosoftToken() {
    const refreshToken = localStorage.getItem('microsoft_refresh_token');

    const response = await fetch(`${BACKEND_URL}/auth/microsoft/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await response.json();

    localStorage.setItem('microsoft_access_token', data.access_token);
    localStorage.setItem('microsoft_expires_at', Date.now() + data.expires_in * 1000);

    return data.access_token;
}

export async function getMicrosoftToken() {
    const expiresAt = Number(localStorage.getItem('microsoft_expires_at'));

    if (Date.now() < expiresAt - 60000) {
        return localStorage.getItem('microsoft_access_token');
    }

    return await refreshMicrosoftToken();
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