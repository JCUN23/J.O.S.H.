// Frame TVs on the local network (backend: routes/frametv.js)
import { BACKEND_URL } from '../config';

async function call(method, path, body) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

export const getFrameTvs = () => call('GET', '/api/frametv');
export const pairFrameTv = (id) => call('POST', `/api/frametv/${encodeURIComponent(id)}/pair`);
export const frameTvCommand = (id, action, key) =>
    call('POST', `/api/frametv/${encodeURIComponent(id)}/command`, key ? { action, key } : { action });
