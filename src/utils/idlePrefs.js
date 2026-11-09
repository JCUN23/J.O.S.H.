// Idle screen preference, per device. Default: on for the installed wall-panel app
// (standalone display mode), off in a normal browser tab (your laptop).
const KEY = 'idle_mode';
export const IDLE_MINUTES = 3;
export const WAKE_EVENT = 'sentinel:wake';     // dispatch to wake the panel (voice, alerts)
export const ARRIVED_EVENT = 'sentinel:arrived';   // the idle screen saw Josh (camera or tap)

const isInstalledApp = () => {
    try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
};

export function getIdleEnabled() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'on') return true;
        if (v === 'off') return false;
    } catch { /* storage unavailable */ }
    return isInstalledApp();
}

export function setIdleEnabled(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}
