import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createUtterance, mergeSpeech, END_OF_SPEECH_MS } from './utterance';

describe('createUtterance', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a pause mid-sentence does not cut you off (Nov 8 bug)', () => {
        const done = vi.fn();
        const u = createUtterance({ onDone: done });
        u.push({ partial: 'turn on' });
        u.push({ final: 'turn on' });                     // Chrome finalizes at the pause
        vi.advanceTimersByTime(800);                       // ...user is still talking
        expect(done).not.toHaveBeenCalled();
        expect(u.push({ partial: 'the lights' })).toBe('turn on the lights');
        u.push({ final: 'the lights' });
        vi.advanceTimersByTime(END_OF_SPEECH_MS);
        expect(done).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledWith('turn on the lights');
    });

    it('Android re-sending earlier words does not double them (Nov 8 bug #2)', () => {
        const done = vi.fn();
        const u = createUtterance({ onDone: done });
        u.push({ partial: 'what is on' });
        u.push({ final: 'what is on my' });
        expect(u.push({ partial: 'what is on my calendar' })).toBe('what is on my calendar');
        u.push({ final: 'what is on my calendar this weekend' });
        vi.advanceTimersByTime(END_OF_SPEECH_MS);
        expect(done).toHaveBeenCalledWith('what is on my calendar this weekend');
    });

    it('drops fragments too short to be a command, and cancel discards', () => {
        const done = vi.fn();
        const u = createUtterance({ onDone: done });
        u.push({ final: 'uh' });
        vi.advanceTimersByTime(END_OF_SPEECH_MS);
        expect(done).not.toHaveBeenCalled();
        u.push({ final: 'movie night' });
        u.cancel();
        vi.advanceTimersByTime(END_OF_SPEECH_MS);
        expect(done).not.toHaveBeenCalled();
        expect(u.pending()).toBe(false);
    });

    it('a trailing interim that never finalizes still counts', () => {
        const done = vi.fn();
        const u = createUtterance({ onDone: done });
        u.push({ final: 'play some' });
        u.push({ partial: 'jazz' });
        vi.advanceTimersByTime(END_OF_SPEECH_MS);
        expect(done).toHaveBeenCalledWith('play some jazz');
    });
});

describe('mergeSpeech', () => {
    it('joins separate pieces (desktop) and overlapping ones (Android)', () => {
        expect(mergeSpeech('turn on', 'the lights')).toBe('turn on the lights');
        expect(mergeSpeech('turn on', 'turn on the lights')).toBe('turn on the lights');
        expect(mergeSpeech('turn on the', 'the lights')).toBe('turn on the lights');
        expect(mergeSpeech('turn on the lights', 'lights')).toBe('turn on the lights');
        expect(mergeSpeech('Turn on,', 'turn on the lights')).toBe('Turn on, the lights');
        expect(mergeSpeech('', 'movie night')).toBe('movie night');
    });
});
