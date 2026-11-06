// Scenes, rules and the activity log (backend: routes/automation.js)
import { BACKEND_URL } from '../config';

export const ACTIVITY_CHANGED = 'sentinel:activity-changed';   // same-tab refresh signal

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

const announce = (x) => { window.dispatchEvent(new Event(ACTIVITY_CHANGED)); return x; };

export const getScenes = () => call('GET', '/api/scenes').then((d) => d.scenes);
export const activateScene = (id) => call('POST', `/api/scenes/${encodeURIComponent(id)}/activate`).then(announce);
export const getRules = () => call('GET', '/api/rules').then((d) => d.rules);
export const setRuleEnabled = (id, enabled) => call('PATCH', `/api/rules/${encodeURIComponent(id)}`, { enabled }).then(announce);
export const runRule = (id) => call('POST', `/api/rules/${encodeURIComponent(id)}/run`).then(announce);
export const getActivity = (limit = 30) => call('GET', `/api/activity?limit=${limit}`).then((d) => d.entries);
