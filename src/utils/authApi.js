// Server-held OAuth logins. The backend stores tokens and refreshes them; the
// browser only ever receives short-lived access tokens (never refresh tokens).
import { BACKEND_URL } from '../config';

// -> { access_token, expires_at } or null when not connected
export async function getProviderToken(provider) {
    const res = await fetch(`${BACKEND_URL}/auth/${provider}/access-token`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${provider} token request failed (HTTP ${res.status})`);
    return res.json();
}

// -> { google, microsoft, spotify, smartthings } booleans
export async function getAuthStatus() {
    const res = await fetch(`${BACKEND_URL}/auth/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export async function disconnectProvider(provider) {
    await fetch(`${BACKEND_URL}/auth/${provider}/disconnect`, { method: 'POST' });
}

// One-time move of logins from the old localStorage flow into the server store, so
// the laptop's existing Google/Microsoft login carries over to every device.
const LEGACY = {
    google: ['google_access_token', 'google_refresh_token', 'google_expires_at'],
    microsoft: ['microsoft_access_token', 'microsoft_refresh_token', 'microsoft_expires_at'],
};

export async function migrateLegacyTokens() {
    for (const [provider, keys] of Object.entries(LEGACY)) {
        let refreshToken;
        try { refreshToken = localStorage.getItem(keys[1]); } catch { return; }
        if (!refreshToken || refreshToken === 'undefined') continue;
        try {
            const res = await fetch(`${BACKEND_URL}/auth/${provider}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            // Imported, already connected, or rejected (stale): local copy is done either way.
            if (res.ok || res.status === 400) keys.forEach((k) => localStorage.removeItem(k));
        } catch (err) {
            console.warn(`[auth] ${provider} migration failed, will retry next load:`, err);
        }
    }
}
