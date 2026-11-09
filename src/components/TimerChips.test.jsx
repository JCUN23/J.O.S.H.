import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import TimerChips from './TimerChips';

describe('TimerChips', () => {
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('shows running timers with a countdown and cancels on tap', async () => {
        const now = Date.now();
        const posts = [];
        vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
            if (opts?.method === 'POST') { posts.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; }
            return { ok: true, json: async () => ({ now, items: [
                { id: 'a', kind: 'timer', label: 'pasta', dueAt: now + 125_000 },
                { id: 'b', kind: 'reminder', label: 'call Mom', dueAt: new Date(2026, 10, 9, 17, 0).getTime() + 365 * 86400_000 },
            ] }) };
        }));
        render(<TimerChips theme="cyan" />);
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        expect(screen.getByText(/pasta 2:0[45]/)).toBeTruthy();
        expect(screen.getByText(/5:00 PM call Mom/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Cancel pasta'));
        expect(posts).toEqual([{ label: 'a' }]);
        expect(screen.queryByText(/pasta/)).toBeNull();
    });

    it('nothing running: renders nothing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ now: Date.now(), items: [] }) })));
        render(<TimerChips theme="cyan" />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByTestId('timer-chips')).toBeNull();
    });
});
