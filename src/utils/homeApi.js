// Presence, printer and notifications (backend: routes/home.js)
import { BACKEND_URL } from '../config';

async function call(method, path) {
    const res = await fetch(`${BACKEND_URL}${path}`, { method });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.reason || `HTTP ${res.status}`);
    return data;
}

export const getPresence = () => call('GET', '/api/presence');
export const getPrinter = () => call('GET', '/api/printer');
export const getNotifyConfig = () => call('GET', '/api/notify');
export const sendTestNotification = () => call('POST', '/api/notify/test');
