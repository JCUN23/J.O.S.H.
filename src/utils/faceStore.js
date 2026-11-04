// Registered faces: the server is the source of truth (shared by every device);
// localStorage is a cache so the lock screen can decide instantly and works offline.
import { BACKEND_URL } from '../config';

const CACHE_KEY = 'registered_faces';
export const FACES_CHANGED = 'sentinel:faces-changed'; // same-tab change event

export function getCachedFaces() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}

function cache(faces) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(faces)); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(FACES_CHANGED));
}

async function upload(faces) {
    const res = await fetch(`${BACKEND_URL}/api/faces`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faces }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    return (await res.json()).faces;
}

// Pull the shared list. If the server has never been set up, this device's local
// faces become the shared list (one-time migration). If the server was set up and
// is empty, faces were deleted on purpose: clear the local copy, don't resurrect them.
export async function syncFaces() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/faces`);
        if (!res.ok) return getCachedFaces();
        const { initialized, faces } = await res.json();
        const local = getCachedFaces();
        if (!initialized && local.length) {
            const uploaded = await upload(local);
            cache(uploaded);
            return uploaded;
        }
        cache(faces);
        return faces;
    } catch {
        return getCachedFaces(); // backend unreachable: keep working from the cache
    }
}

// Save the full list (after add/delete). Throws if the server rejects it, so the
// caller can tell the user instead of silently diverging from other devices.
export async function saveFaces(faces) {
    const saved = await upload(faces);
    cache(saved);
    return saved;
}
