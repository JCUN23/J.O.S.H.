import { BACKEND_URL } from '../../config';
const CLIENT_ID = "0982022f80f240138fd76bad2c53f3bd";
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? window.location.origin;

const TOKEN_KEY = "spotify_access_token";
const EXPIRY_KEY = "spotify_token_expiry";
const VERIFIER_KEY = "spotify_pkce_verifier";

const SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-email",
    "user-read-private",
    "user-library-read",
    "user-library-modify",         // "Alfred, like this song"
    "user-read-recently-played",   // "Last played" card
    "streaming",                   // Web Playback SDK: the panel as a Spotify device
].join(" ");

/* =====================
   AUTH FLOW
===================== */

export async function startSpotifyAuth() {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        code_challenge_method: "S256",
        code_challenge: challenge,
    });

    window.location.href =
        `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    if (!verifier) throw new Error("Missing PKCE verifier");

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
    });

    const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error("[Spotify] Token exchange failed:", text);
        throw new Error("Spotify token exchange failed");
    }

    const data = await res.json();
    localStorage.removeItem(VERIFIER_KEY);

    // Hand the login to the server, which owns refreshing it (the old flow threw the
    // refresh token away, so Spotify died after an hour). Every device shares it.
    const stored = await fetch(`${BACKEND_URL}/auth/spotify/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
        }),
    });
    if (!stored.ok) console.warn("[Spotify] Server didn't store the login; this device only, ~1h:", stored.status);

    cacheToken(data.access_token, Date.now() + data.expires_in * 1000);
    return data.access_token;
}

/* =====================
   SERVER SYNC
   The player reads a local cached access token (sync, cheap). This keeps that
   cache fresh from the server, which refreshes ~5 min before expiry.
===================== */

const SYNC_MS = 4 * 60 * 1000;

function cacheToken(token, expiresAt) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, String(expiresAt));
}

export async function syncSpotifyToken() {
    try {
        const res = await fetch(`${BACKEND_URL}/auth/spotify/access-token`);
        if (res.status === 404) {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(EXPIRY_KEY);
            return null;
        }
        if (!res.ok) return getAccessToken(); // backend hiccup: keep whatever we have
        const { access_token, expires_at } = await res.json();
        if (access_token !== localStorage.getItem(TOKEN_KEY)) cacheToken(access_token, expires_at);
        return access_token;
    } catch {
        return getAccessToken();
    }
}

// Call once at app start. Returns a stop function.
export function startSpotifyTokenSync() {
    syncSpotifyToken();
    const id = setInterval(syncSpotifyToken, SYNC_MS);
    return () => clearInterval(id);
}

/* =====================
   TOKEN ACCESS
===================== */

export function getAccessToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = Number(localStorage.getItem(EXPIRY_KEY));

    if (!token || !expiry) return null;
    if (Date.now() > expiry) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EXPIRY_KEY);
        return null;
    }
    return token;
}

/* =====================
   PKCE HELPERS
===================== */

function generateCodeVerifier(length) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
