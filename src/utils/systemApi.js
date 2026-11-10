// Pi diagnostics (backend: routes/system.js, lib/systemStats.js)
import { BACKEND_URL } from '../config';

const getJson = async (path) => {
    const res = await fetch(`${BACKEND_URL}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
};

export const getSystem = () => getJson('/api/system');
export const getVoiceStatus = () => getJson('/api/voice/status');

// 2d 5h / 3h 2m / 12m
export const fmtUptime = (s) => {
    if (s == null) return '—';
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};
