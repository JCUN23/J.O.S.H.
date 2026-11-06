import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

vi.mock('./IdleCave', () => ({ default: () => null }));
vi.mock('../utils/faceApiLoader', () => ({ loadFaceDetector: () => Promise.reject(new Error('no camera in tests')) }));
import IdleMode from './IdleMode';
import { WAKE_EVENT } from '../utils/idlePrefs';

const overlay = () => screen.queryByRole('button', { name: 'Wake the panel' });

describe('IdleMode', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('shows the clock after the timeout and wakes on the wake event', () => {
        render(<IdleMode enabled minutes={3} theme="cyan" />);
        act(() => { vi.advanceTimersByTime(2 * 60000); });
        expect(overlay()).toBeNull();
        act(() => { vi.advanceTimersByTime(61000); });
        expect(overlay()).not.toBeNull();
        act(() => { window.dispatchEvent(new Event(WAKE_EVENT)); });
        expect(overlay()).toBeNull();
    });

    it('a touch resets the countdown; tapping the clock wakes it', () => {
        render(<IdleMode enabled minutes={3} theme="cyan" />);
        act(() => { vi.advanceTimersByTime(150000); });
        fireEvent.pointerDown(window);
        act(() => { vi.advanceTimersByTime(150000); });
        expect(overlay()).toBeNull();
        act(() => { vi.advanceTimersByTime(40000); });
        fireEvent.pointerDown(overlay());
        expect(overlay()).toBeNull();
    });

    it('never shows when disabled or paused (locked)', () => {
        const { rerender } = render(<IdleMode enabled={false} minutes={3} theme="cyan" />);
        act(() => { vi.advanceTimersByTime(10 * 60000); });
        expect(overlay()).toBeNull();
        rerender(<IdleMode enabled paused minutes={3} theme="cyan" />);
        act(() => { vi.advanceTimersByTime(10 * 60000); });
        expect(overlay()).toBeNull();
    });
});
