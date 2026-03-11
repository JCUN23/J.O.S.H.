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
