import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processCommand } from './sentinelLocal';

// Which backend calls a command makes: local shortcut (/api/lights) or the AI (/api/sentinel/chat).
let urls;
beforeEach(() => {
    urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
        urls.push(String(url));
        if (String(url).endsWith('/api/lights')) {
            const on = JSON.parse(opts.body).on;
            return { ok: true, json: async () => (on ? { ok: false, failed: ['Govee: 4/6 commands ok (failed: Neon Rope)'] } : { ok: true, failed: [] }) };
        }
        return { ok: true, json: async () => ({ response: 'Saved, and the lights are on.', toolsExecuted: [] }) };
    }));
});

describe('processCommand', () => {
    it('"turn off the lights" uses the backend lights endpoint (Govee + Hue)', async () => {
        const r = await processCommand('turn off the lights');
        expect(urls.map((u) => u.replace(/^.*\/api/, '/api'))).toEqual(['/api/lights']);
        expect(['Lights off.', 'Going dark.', 'Done.']).toContain(r.response);
    });

    it('says which lights failed instead of claiming success', async () => {
        const r = await processCommand('lights on');
        expect(r.response).toMatch(/didn't respond: .*Neon Rope/);
    });

    it('a compound command goes to the AI so every part happens', async () => {
        const r = await processCommand('save this playlist and turn on the lights');
        expect(urls.map((u) => u.replace(/^.*\/api/, '/api'))).toEqual(['/api/sentinel/chat']);
        expect(r.response).toBe('Saved, and the lights are on.');
    });
});
