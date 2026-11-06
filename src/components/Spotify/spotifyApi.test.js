import { describe, it, expect, vi, afterEach } from 'vitest';
import { resumeOn } from './spotifyApi';

const last = { track: { uri: 'spotify:track:abc' }, context: { uri: 'spotify:playlist:xyz' } };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Fake Spotify: transfer result, what /me/player reports, and play results per body type
function fakeSpotify({ transfer = 204, playing = false, contextPlay = 204, trackPlay = 204 }) {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
        calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
        if (url.endsWith('/me/player') && opts.method === 'PUT') return res(transfer);
        if (url.endsWith('/me/player')) return playing ? res(200, { item: { id: 'abc' }, is_playing: true }) : res(204);
        if (url.includes('/me/player/play')) return res(JSON.parse(opts.body).context_uri ? contextPlay : trackPlay);
        return res(404);
    });
    return calls;
}

describe('resumeOn', () => {
    afterEach(() => { vi.useRealTimers(); delete globalThis.fetch; });

    it('transfer that starts playback = resumed in place (no restart)', async () => {
        vi.useFakeTimers();
        const calls = fakeSpotify({ playing: true });
        const p = resumeOn('t', 'panel', last);
        await vi.runAllTimersAsync();
        expect(await p).toBe('resumed');
        expect(calls[0].body).toEqual({ device_ids: ['panel'], play: true });
        expect(calls.some((c) => c.url.includes('/me/player/play'))).toBe(false);
    });

    it('transfer that plays nothing falls back to the last playlist at the last track', async () => {
        vi.useFakeTimers();
        const calls = fakeSpotify({ playing: false });
        const p = resumeOn('t', 'panel', last);
        await vi.runAllTimersAsync();
        expect(await p).toBe('restarted');
        const play = calls.find((c) => c.url.includes('/me/player/play'));
        expect(play.url).toContain('device_id=panel');
        expect(play.body).toEqual({ context_uri: 'spotify:playlist:xyz', offset: { uri: 'spotify:track:abc' } });
    });

    it('unplayable context falls back to just the track; Premium error is explained', async () => {
        vi.useFakeTimers();
        let calls = fakeSpotify({ transfer: 404, contextPlay: 403 });
        let p = resumeOn('t', 'panel', last);
        await vi.runAllTimersAsync();
        expect(await p).toBe('restarted');
        expect(calls.at(-1).body).toEqual({ uris: ['spotify:track:abc'] });

        calls = fakeSpotify({ transfer: 404, contextPlay: 403, trackPlay: 403 });
        p = resumeOn('t', 'panel', last);
        const check = expect(p).rejects.toThrow(/Premium/);
        await vi.runAllTimersAsync();
        await check;
    });
});
