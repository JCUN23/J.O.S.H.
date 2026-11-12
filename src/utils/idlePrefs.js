// Idle screen preference, per device. Default: on for the installed wall-panel app,
// off in a browser tab (your laptop) and on phones.
const KEY = 'idle_mode';
export const IDLE_MINUTES = 3;
export const WAKE_EVENT = 'sentinel:wake';     // dispatch to wake the panel (voice, alerts)
export const ARRIVED_EVENT = 'sentinel:arrived';   // the idle screen saw Josh (camera or tap)
export const IDLE_NOW_EVENT = 'sentinel:idle-now'; // "Alfred, go to sleep": show the idle screen now

import { isWallPanel } from './device';

export function getIdleEnabled() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'on') return true;
        if (v === 'off') return false;
    } catch { /* storage unavailable */ }
    return isWallPanel();
}

export function setIdleEnabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}
