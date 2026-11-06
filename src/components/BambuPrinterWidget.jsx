import { useEffect, useState } from 'react';
import { Printer, Flame, Thermometer, Layers, Clock } from 'lucide-react';
import { getPrinter } from '../utils/homeApi';

const LABELS = { IDLE: 'Idle', PREPARE: 'Preparing', RUNNING: 'Printing', PAUSE: 'Paused', FINISH: 'Finished', FAILED: 'Failed', SLICING: 'Slicing' };
const PILL = {
    RUNNING: 'bg-green-600/30 text-green-400', PREPARE: 'bg-yellow-600/30 text-yellow-300', PAUSE: 'bg-yellow-600/30 text-yellow-300',
    FINISH: 'bg-blue-600/30 text-blue-300', FAILED: 'bg-red-600/30 text-red-400',
};
const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const temp = (now, target) => (now == null ? '–' : `${Math.round(now)}°${target ? ` / ${Math.round(target)}°` : ''}`);

// Bambu Lab printer over its local MQTT API (backend: lib/bambu.js).
const BambuPrinterWidget = ({ theme }) => {
    const [p, setP] = useState(null);
    const [error, setError] = useState('');
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        getPrinter()
            .then((d) => { if (alive) { setP(d); setError(''); } })
            .catch(() => { if (alive) setError("Couldn't reach Sentinel's backend."); });
        return () => { alive = false; };
    }, [tick]);

    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), p?.active ? 10000 : 30000);
        return () => clearInterval(t);
    }, [p?.active]);

    const muted = `text-${theme}-600`;
    return (
        <div className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[220px]`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Printer className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>{(p?.name || 'Bambu P2S').toUpperCase()}</h3>
                </div>
                {p?.configured && (
                    <span className={`text-[10px] px-2 py-0.5 rounded ${!p.connected ? 'bg-gray-700/40 text-gray-400' : PILL[p.state] || `bg-${theme}-900/40 text-${theme}-300`}`}>
                        {!p.connected ? 'Offline' : LABELS[p.state] || p.state || 'Connecting'}
                    </span>
                )}
            </div>

            {error && <div className="text-xs text-red-400">{error}</div>}

            {p && !p.configured && (
                <div className={`text-xs ${muted} space-y-1`}>
                    <div>Not set up yet. On the printer: Settings → Network for the IP and LAN access code, Settings → Device for the serial number. Then add to backend/.env:</div>
                    <code className={`block text-${theme}-400`}>BAMBU_HOST=… BAMBU_SERIAL=… BAMBU_ACCESS_CODE=…</code>
                </div>
            )}

            {p?.configured && !p.connected && (
                <div className={`text-xs ${p.error ? 'text-red-400' : muted}`}>
                    {p.error ? `Can't connect: ${p.error}` : 'Connecting to the printer…'}
                </div>
            )}

            {p?.connected && (
                <div className="space-y-3">
                    {p.active || p.state === 'FINISH' || p.state === 'FAILED' ? (
                        <div>
                            <div className="flex items-baseline justify-between mb-1">
                                <div className={`text-sm text-${theme}-300 truncate pr-2`} title={p.job || ''}>{p.job || 'Print job'}</div>
                                <div className={`text-2xl font-semibold text-${theme}-400 tabular-nums`}>{p.percent ?? 0}%</div>
                            </div>
                            <div className={`h-2 rounded-full bg-black/60 border border-${theme}-900 overflow-hidden`}>
                                <div className={`h-full transition-all duration-700 ${p.state === 'FAILED' ? 'bg-red-500' : `bg-${theme}-500`}`} style={{ width: `${p.percent ?? 0}%` }} />
                            </div>
                            <div className={`flex justify-between mt-2 text-xs ${muted}`}>
                                <span className="flex items-center gap-1"><Layers size={12} /> {p.layer ?? '–'} / {p.totalLayers ?? '–'}</span>
                                {p.active && p.remainingMin != null && (
                                    <span className="flex items-center gap-1"><Clock size={12} /> {hm(p.remainingMin)} left{p.finishAt ? ` · ${clock(p.finishAt)}` : ''}</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className={`text-xs ${muted}`}>Ready. Start a print and progress shows up here.</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className={`bg-black/40 border border-${theme}-900 rounded p-2 flex items-center gap-2`}>
                            <Flame size={14} className="text-orange-400" /><span className={`text-${theme}-300`}>Nozzle {temp(p.nozzle, p.nozzleTarget)}</span>
                        </div>
                        <div className={`bg-black/40 border border-${theme}-900 rounded p-2 flex items-center gap-2`}>
                            <Thermometer size={14} className="text-red-400" /><span className={`text-${theme}-300`}>Bed {temp(p.bed, p.bedTarget)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BambuPrinterWidget;
