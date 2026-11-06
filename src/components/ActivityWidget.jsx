import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { getActivity, ACTIVITY_CHANGED } from '../utils/automationApi';

const REFRESH_MS = 20_000;
const SOURCE_LABEL = { scene: 'Scene', rule: 'Rule', gameday: 'Game Day', voice: 'Voice', panel: 'Panel', manual: 'Manual', system: 'System' };

const timeAgo = (iso) => {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// What the house did, and why.
const ActivityWidget = ({ theme }) => {
    const [entries, setEntries] = useState([]);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(null);

    const [tick, setTick] = useState(0);
    const load = useCallback(() => setTick((t) => t + 1), []);   // refresh = bump the tick

    // Fetch on mount and on every refresh; state is set from the promise callback
    // (never synchronously in the effect), and ignored if the widget unmounted.
    useEffect(() => {
        let alive = true;
        getActivity(30)
            .then((e) => { if (alive) { setEntries(e); setError(''); } })
            .catch(() => { if (alive) setError("Couldn't load activity."); });
        return () => { alive = false; };
    }, [tick]);

    useEffect(() => {
        const id = setInterval(load, REFRESH_MS);
        window.addEventListener(ACTIVITY_CHANGED, load);
        return () => { clearInterval(id); window.removeEventListener(ACTIVITY_CHANGED, load); };
    }, [load]);

    return (
        <div className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px] max-h-96 flex flex-col`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Activity className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>ACTIVITY</h3>
                </div>
                <button onClick={load} aria-label="Refresh activity" className={`text-${theme}-600 hover:text-${theme}-400`}>
                    <RefreshCw size={14} />
                </button>
            </div>
            {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
            {!error && entries.length === 0 && (
                <div className={`text-xs text-${theme}-700`}>Nothing yet. Run a scene and it shows up here.</div>
            )}
            <ul className="space-y-1 overflow-y-auto flex-1 pr-1">
                {entries.map((e) => (
                    <li key={e.id}>
                        <button
                            onClick={() => setOpen(open === e.id ? null : e.id)}
                            className={`w-full text-left bg-black/40 border rounded px-2 py-1.5 ${e.ok ? `border-${theme}-900` : 'border-red-900'}`}
                        >
                            <div className="flex items-baseline gap-2">
                                <span className={`text-[10px] shrink-0 w-14 ${e.ok ? `text-${theme}-600` : 'text-red-400'}`}>{SOURCE_LABEL[e.source] || e.source}</span>
                                <span className={`text-xs text-${theme}-300 truncate flex-1`}>{e.title}</span>
                                <span className={`text-[10px] text-${theme}-700 shrink-0`}>{timeAgo(e.at)}</span>
                            </div>
                            {open === e.id && (e.detail || e.results.length > 0) && (
                                <div className={`mt-1 text-[10px] text-${theme}-500 space-y-0.5 pl-16`}>
                                    {e.detail && <div className={`text-${theme}-700`}>{e.detail}</div>}
                                    {e.results.map((r, i) => (
                                        <div key={i} className={/error|not configured|not connected|not found/i.test(r) ? 'text-red-400' : ''}>{r}</div>
                                    ))}
                                </div>
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ActivityWidget;
