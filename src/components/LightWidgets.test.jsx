import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import GoveeWidget from './GoveeWidget';
import PhilipsHueWidget from './PhillipsHueWidget';

HTMLCanvasElement.prototype.getContext = () => null;

let calls;
const hue = { 4: { name: 'Left Go', type: 'Extended color light', state: { on: true, bri: 200 } }, 5: { name: 'Right Go', type: 'Extended color light', state: { on: false, bri: 100 } } };
const govee = [
    { device: 'A', model: 'H61A2', deviceName: 'Office Neon', supportCmds: ['turn', 'brightness', 'color', 'colorTem'] },
    { device: 'B', model: 'H61A2', deviceName: 'Desk Neon', supportCmds: ['turn', 'brightness', 'color'] },
    { device: 'C', model: 'H5086', deviceName: 'Plug', supportCmds: ['turn'] },
];
beforeEach(() => {
    localStorage.clear();
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = String(url).replace(/^.*?\/api/, '/api');
        calls.push([opts.method || 'GET', u, opts.body && JSON.parse(opts.body)]);
        const json = (b) => ({ ok: true, status: 200, json: async () => b });
        if (u === '/api/hue/lights') return json(hue);
        if (u === '/api/hue/groups') return json({});
        if (u.startsWith('/api/hue/lights/')) return json([{ success: {} }]);
        if (u === '/api/govee/devices') return json({ data: { devices: govee } });
        if (u.startsWith('/api/govee/state/')) return json({ data: { properties: [{ online: true }, { powerState: 'on' }, { brightness: 70 }] } });
        if (u === '/api/govee/control') return json({ code: 200 });
        return { ok: false, status: 404, json: async () => ({}) };
    }));
});
afterEach(cleanup);

describe('light widgets keep the selected light after a change (regression: snapped back to the first)', () => {
    it('Hue: pick Right Go, turn it on, still Right Go after the refresh', async () => {
        render(<PhilipsHueWidget theme="cyan" setHueIsConnected={() => {}} />);
        const select = await screen.findByLabelText('Hue light');
        fireEvent.change(select, { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: /^ON$/ }));
        await waitFor(() => expect(calls.filter(([, u]) => u === '/api/hue/lights').length).toBe(2), { timeout: 2000 });
        expect(screen.getByLabelText('Hue light').value).toBe('5');
        expect(calls.find(([m, u]) => m === 'PUT' && u === '/api/hue/lights/5')).toBeTruthy();
    });

    it('Hue: the choice is remembered across a remount', async () => {
        localStorage.setItem('selected_hue', '5');
        render(<PhilipsHueWidget theme="cyan" setHueIsConnected={() => {}} />);
        expect((await screen.findByLabelText('Hue light')).value).toBe('5');
    });

    it('Govee: Hue-style layout; pick Desk Neon, change it, still Desk Neon', async () => {
        render(<GoveeWidget theme="cyan" setGoveeIsConnected={() => {}} />);
        const select = await screen.findByLabelText('Govee light');
        fireEvent.change(select, { target: { value: 'B' } });
        expect(screen.getByText('Desk Neon', { selector: 'div' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^ON$/ }));
        await waitFor(() => expect(calls.some(([m, u, b]) => m === 'POST' && u === '/api/govee/control' && b.device === 'B')).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh Govee' }));
        await waitFor(() => expect(calls.filter(([, u]) => u === '/api/govee/devices').length).toBe(2));
        expect(screen.getByLabelText('Govee light').value).toBe('B');
        expect(localStorage.getItem('selected_govee')).toBe('B');
    });

    it('Govee: sections match the device; a plug is power only', async () => {
        render(<GoveeWidget theme="cyan" setGoveeIsConnected={() => {}} />);
        await screen.findByLabelText('Govee light');
        expect(screen.getByText('Brightness')).toBeTruthy();
        expect(screen.getByText('Colors')).toBeTruthy();
        expect(screen.getByText('White')).toBeTruthy();
        fireEvent.click(screen.getByText('Colors'));
        expect(screen.getByTestId('color-studio')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Govee light'), { target: { value: 'C' } });
        expect(screen.queryByText('Brightness')).toBeNull();
        expect(screen.queryByText('Colors')).toBeNull();
    });
});
