import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processCommand, allLights } from './sentinelLocal';

// One brain: every command goes to the backend, which handles instant commands itself.
let calls;
let reply;
beforeEach(() => {
    calls = [];
    reply = { status: 200, body: { response: 'Lights off.', toolsExecuted: [{ tool: 'control_all_lights', args: { action: 'off' } }] } };
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
        calls.push({ url: String(url).replace(/^.*\/api/, '/api'), body: JSON.parse(opts.body) });
        if (reply instanceof Error) throw reply;
        return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
    }));
});

describe('processCommand', () => {
    it('sends what was said to the backend and returns its answer', async () => {
        const r = await processCommand('turn off the lights');
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('/api/sentinel/chat');
        expect(calls[0].body.message).toBe('turn off the lights');
        expect(r).toEqual({ response: 'Lights off.', musicPlaying: false, panelActions: [], endConversation: false });
    });

    it('"thanks": the backend ends the conversation, so the panel stops listening', async () => {
        reply = { status: 200, body: { response: 'Anytime.', toolsExecuted: [], endConversation: true } };
        expect((await processCommand('thanks')).endConversation).toBe(true);
    });

    it('flags music so the panel mic waits before listening again', async () => {
        reply = { status: 200, body: { response: 'Playing Discover Weekly.', toolsExecuted: [{ tool: 'play_music', args: {} }] } };
        expect((await processCommand('play discover weekly')).musicPlaying).toBe(true);
    });

    it('server down / AI failing: says so', async () => {
        reply = new Error('offline');
        expect((await processCommand('hi')).response).toMatch(/can't reach the Sentinel server/);
        reply = { status: 502, body: { error: 'AI processing failed' } };
        expect((await processCommand('hi')).response).toMatch(/AI service isn't responding/);
    });
});

describe('allLights (Quick Controls)', () => {
    it('names the lights that failed instead of claiming success', async () => {
        reply = { status: 200, body: { ok: false, failed: ['Govee: 4/6 commands ok (failed: Neon Rope)'] } };
        expect((await allLights(true, ['All lights on.'])).response).toMatch(/didn't respond: .*Neon Rope/);
        reply = { status: 200, body: { ok: true, failed: [] } };
        expect((await allLights(false, ['All lights off.'])).response).toBe('All lights off.');
    });
});

describe('panel actions', () => {
    it('control_panel results come back for the panel to apply', async () => {
        reply = { status: 200, body: { response: 'Showing the calendar.', toolsExecuted: [{ tool: 'control_panel', args: { action: 'show', target: 'calendar' } }, { tool: 'get_time', args: {} }] } };
        const r = await processCommand('show me the calendar');
        expect(r.panelActions).toEqual([{ action: 'show', target: 'calendar' }]);
    });
});
