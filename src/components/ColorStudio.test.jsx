import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ColorStudio from './ColorStudio';

// jsdom has no PointerEvent (pointer coordinates would be lost) and no canvas.
if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
        constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId; }
    };
}
HTMLCanvasElement.prototype.getContext = () => null;

const wheel = () => {
    const el = screen.getByTestId('color-wheel');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 });
    return el;
};

describe('ColorStudio', () => {
    beforeEach(() => localStorage.clear());
    afterEach(cleanup);

    it('dragging previews live and commits once on release (top edge = pure red)', () => {
        const onPreview = vi.fn(); const onCommit = vi.fn();
        render(<ColorStudio theme="cyan" onPreview={onPreview} onCommit={onCommit} />);
        const w = wheel();
        fireEvent.pointerDown(w, { clientX: 100, clientY: 100, pointerId: 1 });   // center = white
        fireEvent.pointerMove(w, { clientX: 100, clientY: 50, pointerId: 1 });
        fireEvent.pointerUp(w, { clientX: 100, clientY: 0, pointerId: 1 });
        expect(onPreview).toHaveBeenCalledTimes(2);
        expect(onPreview.mock.calls[0][0]).toEqual({ r: 255, g: 255, b: 255 });
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith({ r: 255, g: 0, b: 0 });
        expect(screen.getByLabelText('Hex color').value).toBe('#ff0000');
    });

    it('typing an exact hex commits it; junk is reverted', () => {
        const onCommit = vi.fn();
        render(<ColorStudio theme="cyan" onCommit={onCommit} />);
        const input = screen.getByLabelText('Hex color');
        fireEvent.change(input, { target: { value: '#0076B6' } });
        fireEvent.blur(input);
        expect(onCommit).toHaveBeenCalledWith({ r: 0, g: 118, b: 182 });
        fireEvent.change(input, { target: { value: 'nope' } });
        fireEvent.blur(input);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(input.value).toBe('#0076b6');
    });

    it('R G B fields set exact values; team swatches and recents work', () => {
        const onCommit = vi.fn();
        render(<ColorStudio theme="cyan" onCommit={onCommit} />);
        fireEvent.change(screen.getByLabelText('G value'), { target: { value: '128' } });
        fireEvent.blur(screen.getByLabelText('G value'));
        expect(onCommit).toHaveBeenLastCalledWith({ r: 255, g: 128, b: 255 });
        fireEvent.click(screen.getByLabelText('Maize'));
        expect(onCommit).toHaveBeenLastCalledWith({ r: 255, g: 203, b: 5 });
        expect(screen.getByText('Recent')).toBeTruthy();
    });

    it('disabled: no commands', () => {
        const onCommit = vi.fn();
        render(<ColorStudio theme="cyan" onCommit={onCommit} disabled />);
        fireEvent.pointerDown(wheel(), { clientX: 100, clientY: 0, pointerId: 1 });
        fireEvent.pointerUp(wheel(), { clientX: 100, clientY: 0, pointerId: 1 });
        expect(onCommit).not.toHaveBeenCalled();
    });
});
