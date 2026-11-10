import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SystemWidget from './SystemWidget';
import { fmtUptime } from '../utils/systemApi';

const pi = {
    model: 'Raspberry Pi 5 Model B Rev 1.0', tempC: 78.4, cpuPercent: 23, cores: 4,
    load: { one: 0.41, five: 0.33, fifteen: 0.3 },
    memory: { totalMb: 2009, usedMb: 1840, swapTotalMb: 512, swapUsedMb: 100 },
    disk: { totalGb: 58.4, usedGb: 9.1 }, fanRpm: 3120,
    throttled: { raw: '0x50000', now: [], sinceBoot: ['under-voltage', 'throttled'] },
    uptimeS: 2 * 86400 + 5 * 3600, backend: { rssMb: 96, uptimeS: 600 },
};
const stub = (system, voice = { listener: { mic: 'UM02' } }) => vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (u.endsWith('/api/system')) return system ? json(system) : { ok: false, status: 500, json: async () => ({}) };
    if (u.endsWith('/api/voice/status')) return json(voice);
    return { ok: false, status: 404, json: async () => ({}) };
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Pi diagnostics widget', () => {
    it('shows temp (hot = red), RAM near full, fan, uptime, throttle history, mic', async () => {
        stub(pi);
        render(<SystemWidget theme="cyan" />);
        const temp = await screen.findByTestId('pi-temp');
        expect(temp.textContent).toBe('78.4°C');
        expect(temp.className).toContain('text-red-400');
        expect(screen.getByText('173°F')).toBeTruthy();
        expect(screen.getByText('1840 / 2009 MB · 92%')).toBeTruthy();
        expect(screen.getByText('3120 rpm')).toBeTruthy();
        expect(screen.getByText('2d 5h')).toBeTruthy();
        expect(screen.getByText(/since boot: under-voltage, throttled/)).toBeTruthy();
        expect(screen.getByText('23%')).toBeTruthy();
        expect(await screen.findByTitle('Mic listener online (UM02)')).toBeTruthy();
    });

    it('off the Pi (dev Mac): n/a instead of crashing; backend down: says so', async () => {
        stub({ ...pi, model: null, tempC: null, fanRpm: null, throttled: null }, { listener: null });
        render(<SystemWidget theme="cyan" />);
        expect((await screen.findByTestId('pi-temp')).textContent).toBe('—');
        expect(screen.getByText('n/a')).toBeTruthy();
        expect(screen.getByText('Power: n/a')).toBeTruthy();
        expect(await screen.findByText(/Mic offline/)).toBeTruthy();
        cleanup();
        stub(null);
        render(<SystemWidget theme="cyan" />);
        expect(await screen.findByText("Can't reach the Pi.")).toBeTruthy();
    });

    it('uptime formatting', () => {
        expect(fmtUptime(59)).toBe('0m');
        expect(fmtUptime(3 * 3600 + 120)).toBe('3h 2m');
        expect(fmtUptime(86400 * 9 + 3600)).toBe('9d 1h');
    });
});
