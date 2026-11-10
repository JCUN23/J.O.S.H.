import { useEffect, useState } from 'react';
import { Cpu, Fan, Thermometer, Mic, ShieldCheck, ShieldAlert } from 'lucide-react';
import { getSystem, getVoiceStatus, fmtUptime } from '../utils/systemApi';

const REFRESH_MS = 5000;
const HISTORY = 60;                 // 5 minutes of temperature at 5s

// The Pi 5 slows itself down at 80 C and hard-throttles at 85 C
const tempTone = (c) => (c == null ? 'text-gray-500' : c < 60 ? 'text-green-400' : c < 75 ? 'text-amber-400' : 'text-red-400');
const barTone = (pct) => (pct < 70 ? 'bg-green-500' : pct < 90 ? 'bg-amber-500' : 'bg-red-500');

const Bar = ({ label, used, total, unit, theme }) => {
    const pct = total ? Math.min(100, Math.round((used / total) * 100)) : null;
    return (
        <div>
            <div className="flex justify-between text-[11px]">
                <span className={`text-${theme}-500`}>{label}</span>
                <span className={`text-${theme}-300`}>{pct == null ? 'n/a' : unit === '%' ? `${pct}%` : `${used} / ${total} ${unit} · ${pct}%`}</span>
            </div>
            <div className={`h-1.5 rounded bg-${theme}-950 border border-${theme}-900 overflow-hidden`}>
                {pct != null && <div className={`h-full ${barTone(pct)}`} style={{ width: `${pct}%` }} />}
            </div>
        </div>
    );
};

// Tiny temperature trend line
const Sparkline = ({ values, theme }) => {
    if (values.length < 2) return <div className="h-8" />;
    const lo = Math.min(...values) - 1; const hi = Math.max(...values) + 1;
    const pts = values.map((v, i) => `${(i / (HISTORY - 1)) * 100},${30 - ((v - lo) / (hi - lo)) * 28}`).join(' ');
    return (
        <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={`w-full h-8 text-${theme}-400`} aria-label="Temperature, last 5 minutes">
            <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" stroke="currentColor" />
        </svg>
    );
};

// Raspberry Pi health: temperature, CPU, RAM, disk, fan, power/throttling, the mic.
const SystemWidget = ({ theme }) => {
    const [s, setS] = useState(null);
    const [temps, setTemps] = useState([]);
    const [mic, setMic] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        const load = () => getSystem()
            .then((d) => {
                if (!alive) return;
                setS(d); setError('');
                if (d.tempC != null) setTemps((t) => [...t, d.tempC].slice(-HISTORY));
            })
            .catch(() => { if (alive) setError("Can't reach the Pi."); });
        const loadMic = () => getVoiceStatus().then((v) => { if (alive) setMic(v.listener || false); }).catch(() => { if (alive) setMic(false); });
        load(); loadMic();
        const a = setInterval(load, REFRESH_MS);
        const b = setInterval(loadMic, 30_000);
        return () => { alive = false; clearInterval(a); clearInterval(b); };
    }, []);

    const th = s?.throttled;
    const f = s?.tempC != null ? Math.round(s.tempC * 9 / 5 + 32) : null;

    return (
        <div className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px] flex flex-col gap-2`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Cpu className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>PI DIAGNOSTICS</h3>
                </div>
                <span className={`text-[10px] text-${theme}-700 truncate max-w-[45%]`} title={s?.model || ''}>{s?.model?.replace(/ Model B.*/, '') || ''}</span>
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
            {s && (
                <>
                    <div className="flex items-end gap-3">
                        <div className="flex items-center gap-1.5">
                            <Thermometer size={18} className={tempTone(s.tempC)} />
                            <span className={`text-3xl font-bold leading-none ${tempTone(s.tempC)}`} data-testid="pi-temp">{s.tempC == null ? '—' : `${s.tempC.toFixed(1)}°C`}</span>
                            {f != null && <span className={`text-xs text-${theme}-600 self-end`}>{f}°F</span>}
                        </div>
                        <div className="flex-1 min-w-0"><Sparkline values={temps} theme={theme} /></div>
                    </div>
                    <Bar label="CPU" used={s.cpuPercent ?? 0} total={s.cpuPercent == null ? 0 : 100} unit="%" theme={theme} />
                    <Bar label="RAM" used={s.memory?.usedMb} total={s.memory?.totalMb} unit="MB" theme={theme} />
                    <Bar label="Disk" used={s.disk?.usedGb} total={s.disk?.totalGb} unit="GB" theme={theme} />
                    <div className={`grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-${theme}-500`}>
                        <div className="flex items-center gap-1"><Fan size={11} /> Fan <span className={`text-${theme}-300 ml-auto`}>{s.fanRpm == null ? 'n/a' : `${s.fanRpm} rpm`}</span></div>
                        <div className="flex">Load <span className={`text-${theme}-300 ml-auto`}>{s.load ? `${s.load.one} / ${s.load.five}` : '—'}</span></div>
                        <div className="flex">Up <span className={`text-${theme}-300 ml-auto`}>{fmtUptime(s.uptimeS)}</span></div>
                        <div className="flex" title={`Backend process: ${s.backend?.rssMb} MB`}>Swap <span className={`text-${theme}-300 ml-auto`}>{s.memory?.swapTotalMb ? `${s.memory.swapUsedMb} MB` : 'none'}</span></div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 text-[11px]">
                        {th == null ? (
                            <div className={`text-${theme}-700`} title="Power/throttle status unavailable (no vcgencmd)">Power: n/a</div>
                        ) : th.now.length ? (
                            <div className="flex items-center gap-1 text-red-400 truncate" title={th.now.join(', ')}><ShieldAlert size={12} className="shrink-0" /> {th.now.join(', ')}</div>
                        ) : th.sinceBoot.length ? (
                            <div className="flex items-center gap-1 text-amber-400 truncate" title={`OK now; since boot: ${th.sinceBoot.join(', ')}`}><ShieldAlert size={12} className="shrink-0" /> since boot: {th.sinceBoot.join(', ')}</div>
                        ) : (
                            <div className="flex items-center gap-1 text-green-400"><ShieldCheck size={12} /> Power OK</div>
                        )}
                        <div className={`flex items-center gap-1 shrink-0 ${mic ? 'text-green-400' : mic === false ? 'text-red-400' : `text-${theme}-700`}`}
                            title={mic ? `Mic listener online (${mic.mic || 'mic'})` : 'Mic listener'}>
                            <Mic size={12} /> Mic {mic ? 'online' : mic === false ? 'offline' : '…'}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SystemWidget;
