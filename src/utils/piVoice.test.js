import { describe, it, expect, beforeEach, vi } from 'vitest';
import { connectPiVoice, getVoicePanel, setVoicePanel } from './piVoice';

class FakeEventSource {
    static last = null;
    constructor(url) { this.url = url; this.closed = false; FakeEventSource.last = this; }
    emit(ev) { this.onmessage?.({ data: JSON.stringify(ev) }); }
    close() { this.closed = true; }
}

describe('piVoice', () => {
    beforeEach(() => { localStorage.clear(); vi.stubGlobal('EventSource', FakeEventSource); });

    it('voice panel: off in a browser tab by default, remembered per device', () => {
        window.matchMedia = () => ({ matches: false });
        expect(getVoicePanel()).toBe(false);
        setVoicePanel(true);
        expect(getVoicePanel()).toBe(true);
    });

    it('voice panel: on by default in the installed app', () => {
        window.matchMedia = () => ({ matches: true });
        expect(getVoicePanel()).toBe(true);
    });

    it('routes events to handlers and disconnects', () => {
        const h = { onWake: vi.fn(), onTranscript: vi.fn(), onNothing: vi.fn(), onError: vi.fn() };
        const stop = connectPiVoice(h);
        const es = FakeEventSource.last;
        expect(es.url).toMatch(/\/api\/voice\/events\?panel=1$/);
        es.emit({ type: 'hello' });
        es.emit({ type: 'wake' });
        es.emit({ type: 'transcript', text: 'lights off' });
        es.emit({ type: 'nothing' });
        es.emit({ type: 'error', text: 'Pi mic: rate limited' });
        es.onmessage({ data: 'not json' });
        expect(h.onWake).toHaveBeenCalledTimes(1);
        expect(h.onTranscript).toHaveBeenCalledWith('lights off');
        expect(h.onNothing).toHaveBeenCalledTimes(1);
        expect(h.onError).toHaveBeenCalledWith('Pi mic: rate limited');
        stop();
        expect(es.closed).toBe(true);
    });

    it('a command id seen twice runs once', () => {
        const onTranscript = vi.fn();
        connectPiVoice({ onTranscript });
        const es = FakeEventSource.last;
        es.emit({ type: 'transcript', text: 'play discover weekly', id: 7 });
        es.emit({ type: 'transcript', text: 'play discover weekly', id: 7 });
        es.emit({ type: 'transcript', text: 'pause', id: 8 });
        expect(onTranscript.mock.calls.map((c) => c[0])).toEqual(['play discover weekly', 'pause']);
    });

    it('announcements (timers, reminders) go to onAnnounce', () => {
        const onAnnounce = vi.fn();
        connectPiVoice({ onAnnounce });
        FakeEventSource.last.emit({ type: 'announce', text: 'Your pasta timer finished.', id: 3 });
        expect(onAnnounce).toHaveBeenCalledWith('Your pasta timer finished.');
    });

    it('a silent follow-up window ends as idle', () => {
        const onIdle = vi.fn(); const onNothing = vi.fn();
        connectPiVoice({ onIdle, onNothing });
        FakeEventSource.last.emit({ type: 'idle' });
        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(onNothing).not.toHaveBeenCalled();
    });
});
