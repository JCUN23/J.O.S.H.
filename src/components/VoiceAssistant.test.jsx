import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import VoiceAssistant from './VoiceAssistant';

const stub = (listener) => vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('/api/voice/status')) return { ok: true, status: 200, json: async () => ({ listener }) };
    if (u.endsWith('/api/timers')) return { ok: true, status: 200, json: async () => ({ now: Date.now(), items: [] }) };
    return { ok: false, status: 404, json: async () => ({}) };
}));
const base = { listening: false, transcript: '', response: '', processing: false, toggleListening: () => {}, onTestAI: () => {},
    theme: 'cyan', wakeWordEnabled: false, wakeWordActive: false, awaitingCommand: false, toggleWakeWordMode: () => {}, voiceError: '' };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('wake word indicator on the voice panel (Nov 11: said INACTIVE while the Pi listened)', () => {
    it('shows the Pi mic listening, and awaiting a command after a wake', async () => {
        stub({ mic: 'UM02' });
        const { rerender } = render(<VoiceAssistant {...base} voicePanel />);
        expect(await screen.findByText('PI MIC: LISTENING FOR "ALFRED"')).toBeTruthy();
        rerender(<VoiceAssistant {...base} voicePanel listening />);
        expect(screen.getByText('AWAITING COMMAND')).toBeTruthy();
    });

    it('says so when the Pi mic is offline', async () => {
        stub(null);
        render(<VoiceAssistant {...base} voicePanel />);
        expect(await screen.findByText('PI MIC OFFLINE')).toBeTruthy();
    });

    it('not the voice panel, tablet wake word off: no indicator', () => {
        stub({ mic: 'UM02' });
        render(<VoiceAssistant {...base} />);
        expect(screen.queryByText(/PI MIC|WAKE WORD/)).toBeNull();
    });
});
