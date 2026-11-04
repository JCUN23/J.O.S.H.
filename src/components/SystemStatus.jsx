import React, { useEffect, useState } from 'react';
import { BACKEND_URL } from '../config';
import { getAuthStatus } from '../utils/authApi';

// System Status ticker: every integration's state scrolling right-to-left like a stock ticker.
// Live flags come from widgets (props), OAuth state from the server's token store, and server-side
// config from GET /api/health, so the bar reports reality instead of hardcoded strings.

const STATE_CLASS = {
    ok: 'text-green-400',
    pending: 'text-cyan-400',
    off: 'text-red-400',
    info: 'text-amber-400',
};

const SECONDS_PER_ITEM = 2.5; // ticker speed scales with item count so it never races
const REFRESH_MS = 60_000;

const useBackendHealth = () => {
    const [health, setHealth] = useState(null); // null = unknown yet
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/health`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (alive) setHealth({ ok: true, integrations: json.integrations || [] });
            } catch {
                if (alive) setHealth({ ok: false, integrations: [] });
            }
        };
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);
    return health;
};

// Which providers have a server-held login (shared by every device).
const useAuthTokens = () => {
    const [tokens, setTokens] = useState({ calendar: false, tesla: false });
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const s = await getAuthStatus();
                if (alive) setTokens({ calendar: s.google || s.microsoft, tesla: s.tesla });
            } catch { /* backend down: the BACKEND item already shows it */ }
        };
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => { alive = false; clearInterval(id); };
    }, []);
    return tokens;
};

const SystemStatus = ({ theme, isSpotifyConnected, isNewsConnected, isGoveeConnected, isSmartThingsConnected, isHueConnected }) => {
    const health = useBackendHealth();
    const tokens = useAuthTokens();

    const configured = (name) => health?.integrations.find((i) => i.name === name)?.enabled;
    const backendDown = health && !health.ok;

    const connected = (flag) => (flag ? ['ok', 'CONNECTED'] : ['off', 'OFFLINE']);
    const authed = (flag) => (flag ? ['ok', 'CONNECTED'] : ['pending', 'PENDING AUTH']);
    const serverSide = (name, onText = 'ONLINE') => {
        if (!health) return ['pending', 'CHECKING'];
        if (backendDown) return ['off', 'BACKEND DOWN'];
        return configured(name) ? ['ok', onText] : ['off', 'NOT CONFIGURED'];
    };

    const items = [
        ['BACKEND', !health ? ['pending', 'CHECKING'] : health.ok ? ['ok', 'ONLINE'] : ['off', 'OFFLINE']],
        ['SENTINEL', serverSide('Sentinel AI (Groq)')],
        ['VOICE', serverSide('ElevenLabs TTS')],
        ['WEATHER', ['ok', 'ONLINE']],
        ['SPORTS', ['ok', 'ONLINE']],
        ['SPOTIFY', authed(isSpotifyConnected)],
        ['CALENDAR', authed(tokens.calendar)],
        ['NEWS', connected(isNewsConnected)],
        ['SMARTTHINGS', connected(isSmartThingsConnected)],
        ['GOVEE', connected(isGoveeConnected)],
        ['HUE', connected(isHueConnected)],
        ['3D PRINTER', ['info', 'VIA CLOUD']],
        ['TESLA', tokens.tesla ? ['ok', 'CONNECTED'] : ['info', 'PARKED']],
        ['ARDUINO', ['off', 'OFFLINE']],
        ['BLUETOOTH', ['off', 'OFFLINE']],
    ];

    const renderItems = (copy) =>
        items.map(([label, [state, text]]) => (
            <div key={`${copy}-${label}`} className="shrink-0" aria-hidden={copy === 'b' ? true : undefined}>
                {label}: <span className={STATE_CLASS[state]}>{text}</span>
                <span className={`mx-4 text-${theme}-800`}>◆</span>
            </div>
        ));

    return (
        <div className={`col-span-12 bg-${theme}-950/30 border border-${theme}-800 rounded-lg py-3 text-xs overflow-hidden`}>
            <style>{`
                @keyframes sentinel-ticker {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .sentinel-ticker-track {
                    animation: sentinel-ticker var(--ticker-duration) linear infinite;
                }
                .sentinel-ticker:hover .sentinel-ticker-track { animation-play-state: paused; }
                .sentinel-ticker {
                    -webkit-mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
                            mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
                }
                @media (prefers-reduced-motion: reduce) {
                    .sentinel-ticker-track { animation: none; flex-wrap: wrap; row-gap: 0.25rem; }
                    .sentinel-ticker-track > .copy-b { display: none; }
                }
            `}</style>
            <div className="sentinel-ticker" role="status" aria-label="System status">
                {/* Two identical copies side by side; sliding exactly -50% loops seamlessly. */}
                <div
                    className={`sentinel-ticker-track flex w-max text-xxs text-${theme}-700 whitespace-nowrap`}
                    style={{ '--ticker-duration': `${items.length * SECONDS_PER_ITEM}s` }}
                >
                    <div className="flex">{renderItems('a')}</div>
                    <div className="flex copy-b">{renderItems('b')}</div>
                </div>
            </div>
        </div>
    );
};

export default SystemStatus;
