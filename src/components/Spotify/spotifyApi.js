const BASE = "https://api.spotify.com/v1";

const auth = token => ({
    Authorization: `Bearer ${token}`,
});

/* =====================
   PLAYBACK
===================== */

export async function getPlayback(token) {
    const res = await fetch(`${BASE}/me/player`, { headers: auth(token) });
    if (res.status === 204) return null;
    return res.json();
}

export const play = token =>
    fetch(`${BASE}/me/player/play`, { method: "PUT", headers: auth(token) });

export const pause = token =>
    fetch(`${BASE}/me/player/pause`, { method: "PUT", headers: auth(token) });

export const next = token =>
    fetch(`${BASE}/me/player/next`, { method: "POST", headers: auth(token) });

export const previous = token =>
    fetch(`${BASE}/me/player/previous`, { method: "POST", headers: auth(token) });

export const seek = (token, positionMs) =>
    fetch(`${BASE}/me/player/seek?position_ms=${positionMs}`, {
        method: "PUT",
        headers: auth(token),
    });

/* =====================
   VOLUME
===================== */

export const setVolume = (token, volume) =>
    fetch(`${BASE}/me/player/volume?volume_percent=${volume}`, {
        method: "PUT",
        headers: auth(token),
    });

/* =====================
   QUEUE / DEVICES
===================== */

export async function getQueue(token) {
    const res = await fetch(`${BASE}/me/player/queue`, {
        headers: auth(token),
    });
    return res.ok ? res.json() : null;
}

export async function getDevices(token) {
    const res = await fetch(`${BASE}/me/player/devices`, {
        headers: auth(token),
    });
    return res.json();
}

export const transferPlayback = (token, deviceId) =>
    fetch(`${BASE}/me/player`, {
        method: "PUT",
        headers: {
            ...auth(token),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });

/* =====================
   LIKE TRACK
===================== */

export const saveTrack = (token, id) =>
    fetch(`${BASE}/me/tracks?ids=${id}`, {
        method: "PUT",
        headers: auth(token),
    });

/* =====================
   RESUME (nothing playing anywhere)
===================== */

export async function getRecentlyPlayed(token) {
    const res = await fetch(`${BASE}/me/player/recently-played?limit=1`, { headers: auth(token) });
    if (res.status === 401 || res.status === 403) return { needsLogin: true };
    if (!res.ok) return null;
    const item = (await res.json())?.items?.[0];
    return item ? { track: item.track, context: item.context, playedAt: item.played_at } : null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const playOn = (token, deviceId, body) => fetch(`${BASE}/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

// Spotify keeps your last session server-side, so transferring to a device with
// play:true usually continues mid-song. If that doesn't start anything, play the
// last context (playlist/album) at the last track; failing that, just the track.
export async function resumeOn(token, deviceId, last) {
    const t = await transferPlayback(token, deviceId);
    if (t.ok) {
        for (let i = 0; i < 3; i++) {
            await wait(800);
            const pb = await getPlayback(token).catch(() => null);
            if (pb?.item && pb.is_playing) return "resumed";
        }
    }
    if (!last?.track) throw new Error(`Spotify didn't start (HTTP ${t.status})`);
    if (last.context?.uri) {
        const r = await playOn(token, deviceId, { context_uri: last.context.uri, offset: { uri: last.track.uri } });
        if (r.ok) return "restarted";
    }
    const r = await playOn(token, deviceId, { uris: [last.track.uri] });
    if (!r.ok) throw new Error(r.status === 403 ? "Spotify Premium is required to play from Sentinel" : `Spotify said HTTP ${r.status}`);
    return "restarted";
}

