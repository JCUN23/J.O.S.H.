import { describe, it, expect } from 'vitest';
import { formatEvents } from './calendarApi';

// Friday Nov 6 2026, 10:30 PM (vitest runs with the machine's TZ; dates are built locally)
const now = new Date(2026, 10, 6, 22, 30);
const iso = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi).toISOString();

describe('formatEvents', () => {
    it('all-day events land on their own date, not 7 PM the day before (Nov 6 bug)', () => {
        const [row] = formatEvents([{ id: 'a', summary: 'Girls weekend in St. Joe', start: { date: '2026-11-07' }, end: { date: '2026-11-09' } }], now);
        expect(row.day).toBe('Tomorrow');
        expect(row.time).toBe('All day · thru Sun');
        expect(row.allDay).toBe(true);
    });

    it('labels the week, sorts all-day first within a day, dedupes shared events', () => {
        const rows = formatEvents([
            { id: 'x', iCalUID: 'u1', summary: 'Dinner', start: { dateTime: iso(2026, 10, 10, 19, 0) }, end: { dateTime: iso(2026, 10, 10, 21, 0) } },
            { id: 'y', iCalUID: 'u1', summary: 'Dinner', start: { dateTime: iso(2026, 10, 10, 19, 0) }, end: { dateTime: iso(2026, 10, 10, 21, 0) } },
            { id: 'z', summary: 'Trash day', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } },
            { id: 'w', summary: 'Late call', start: { dateTime: iso(2026, 10, 6, 23, 0) }, end: { dateTime: iso(2026, 10, 6, 23, 30) } },
        ], now);
        expect(rows.map((r) => r.title)).toEqual(['Late call', 'Trash day', 'Dinner']);
        expect(rows[0].day).toBe('Today');
        expect(rows[1].day).toMatch(/^Tuesday, Nov 10$/);
        expect(rows[1].time).toBe('All day');
        expect(rows[2].dayKey).toBe(rows[1].dayKey);
    });

    it('a trip that started earlier shows as ongoing today', () => {
        const [row] = formatEvents([{ id: 't', summary: 'Trip', start: { date: '2026-11-04' }, end: { date: '2026-11-08' } }], now);
        expect(row.day).toBe('Today');
        expect(row.ongoing).toBe(true);
        expect(row.time).toBe('All day · thru Sat');
    });
});
