// Makes this browser a Spotify Connect device ("Sentinel Panel") with the Web Playback
// SDK. The panel never closes, so there's always a device to resume on, even when the
// Spotify app on your phone/laptop has been closed and dropped off Spotify's device list.
// Needs Spotify Premium and the `streaming` scope. One player per page (module singleton).
import { useSyncExternalStore } from 'react';
import { getAccessToken } from './spotifyAuth';

const PREF_KEY = 'spotify_panel_player';           // 'on' | 'off' per device
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

const isInstalledApp = () => {
    try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
};

// Default: on for the installed wall-panel app, off in a laptop browser tab
// (you'd use the Spotify app there, and two "Sentinel" devices would be confusing).
export function panelPlayerEnabled() {
    try {
        const v = localStorage.getItem(PREF_KEY);
        if (v === 'on') return true;
        if (v === 'off') return false;
    } catch { /* storage unavailable */ }
    return isInstalledApp();
}
export function setPanelPlayerEnabled(on) {
    try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (on) startPanelPlayer(); else stopPanelPlayer();
}

// status: off | loading | ready | offline | needs_login | premium_required | unsupported
let state = { status: 'off', deviceId: null, name: null, error: null };
const listeners = new Set();
const update = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

let sdkPromise = null;
function loadSdk() {
    if (window.Spotify?.Player) return Promise.resolve();
    sdkPromise ||= new Promise((resolve, reject) => {
        window.onSpotifyWebPlaybackSDKReady = () => resolve();
        const s = document.createElement('script');
        s.src = SDK_URL;
        s.async = true;
        s.onerror = () => { sdkPromise = null; reject(new Error('Spotify player script failed to load')); };
        document.body.appendChild(s);
    });
    return sdkPromise;
}

let player = null;
export function startPanelPlayer() {
    if (!panelPlayerEnabled() || !getAccessToken()) return;
    if (player && state.status !== 'needs_login') return;    // already running
    if (player) { player.disconnect(); player = null; }       // retry after a fresh login
    const name = isInstalledApp() ? 'Sentinel Panel' : 'Sentinel (browser)';
    update({ status: 'loading', error: null, name });
    loadSdk().then(() => {
        player = new window.Spotify.Player({ name, volume: 0.6, getOAuthToken: (cb) => cb(getAccessToken()) });
        player.addListener('ready', ({ device_id }) => update({ status: 'ready', deviceId: device_id }));
        player.addListener('not_ready', () => update({ status: 'offline', deviceId: null }));
        player.addListener('authentication_error', ({ message }) => update({ status: 'needs_login', deviceId: null, error: message }));
        player.addListener('account_error', ({ message }) => update({ status: 'premium_required', deviceId: null, error: message }));
        player.addListener('initialization_error', ({ message }) => update({ status: 'unsupported', deviceId: null, error: message }));
        player.addListener('playback_error', ({ message }) => update({ error: message }));
        player.connect();
    }).catch((err) => update({ status: 'unsupported', error: err.message }));
}

export function stopPanelPlayer() {
    player?.disconnect();
    player = null;
    update({ status: 'off', deviceId: null });
}

// Mobile browsers only allow audio after a tap: call this inside the click handler.
export function activatePanelPlayer() {
    try { player?.activateElement?.(); } catch { /* older SDK */ }
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => state;
export const usePanelPlayer = () => useSyncExternalStore(subscribe, snapshot);
