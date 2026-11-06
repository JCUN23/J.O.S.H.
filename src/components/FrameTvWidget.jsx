import { useEffect, useState } from 'react';
import { Tv, Power, Palette, Home, Volume1, Volume2, VolumeX, Link2, Loader2, RefreshCw } from 'lucide-react';
import { getFrameTvs, pairFrameTv, frameTvCommand } from '../utils/frameTvApi';

const stateLabel = (tv) => {
    if (!tv.reachable) return { text: 'Off', cls: 'bg-gray-700/40 text-gray-400' };
    if (tv.power !== 'on') return { text: 'Standby', cls: 'bg-gray-700/40 text-gray-300' };
    if (tv.artMode === 'on') return { text: 'Art mode', cls: 'bg-purple-600/30 text-purple-300' };
    return { text: 'On', cls: 'bg-green-600/30 text-green-400' };
};

// Frame TVs controlled directly on the home network (no SmartThings cloud).
const FrameTvWidget = ({ theme }) => {
    const [data, setData] = useState(null);           // { configured, tvs }
    const [busy, setBusy] = useState(null);           // `${id}:${action}`
    const [msg, setMsg] = useState(null);             // { ok, text }
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        getFrameTvs()
            .then((d) => { if (alive) setData(d); })
            .catch((e) => { if (alive) setMsg({ ok: false, text: e.message }); });
        return () => { alive = false; };
    }, [tick]);

    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const flash = (ok, text) => {
        setMsg({ ok, text });
        setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 5000);
    };
    const updateTv = (status) => setData((d) => d && ({ ...d, tvs: d.tvs.map((t) => (t.id === status.id ? status : t)) }));

    const run = async (tv, action, key) => {
        setBusy(`${tv.id}:${key || action}`);
        try {
            const r = await frameTvCommand(tv.id, action, key);
            updateTv(r.status);
            if (action !== 'key') flash(true, `${tv.name}: ${r.result}`);
        } catch (e) { flash(false, `${tv.name}: ${e.message}`); }
        finally { setBusy(null); }
    };

    const pair = async (tv) => {
        setBusy(`${tv.id}:pair`);
        setMsg({ ok: true, text: `Look at the ${tv.name} TV and choose Allow with the remote…` });
        try {
            const r = await pairFrameTv(tv.id);
            updateTv(r.status);
            flash(r.paired, r.paired ? `${tv.name}: paired` : `${tv.name}: TV didn't return a token`);
        } catch (e) { flash(false, `${tv.name}: ${e.message}`); }
        finally { setBusy(null); }
    };

    const btn = `flex items-center justify-center gap-1.5 bg-black/50 border border-${theme}-800 hover:border-${theme}-600 text-${theme}-300 rounded px-2 py-2 text-xs transition-all disabled:opacity-40`;
    const spin = (tv, a, Icon, size = 14) => (busy === `${tv.id}:${a}` ? <Loader2 size={size} className="animate-spin" /> : <Icon size={size} />);

    return (
        <div className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[220px]`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Tv className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>FRAME TV</h3>
                </div>
                <button onClick={() => setTick((n) => n + 1)} aria-label="Refresh TV status" className={`text-${theme}-600 hover:text-${theme}-400`}>
                    <RefreshCw size={14} />
                </button>
            </div>

            {msg && <div className={`text-xs mb-2 ${msg.ok ? `text-${theme}-400` : 'text-red-400'}`}>{msg.text}</div>}

            {data && !data.configured && (
                <div className={`text-xs text-${theme}-600`}>No TVs set up. Add <code>FRAME_TVS=Office@10.0.0.35</code> to backend/.env and restart.</div>
            )}

            <div className="space-y-3">
                {data?.tvs.map((tv) => {
                    const s = stateLabel(tv);
                    const on = tv.reachable && tv.power === 'on';
                    const any = busy !== null;
                    return (
                        <div key={tv.id} className={`bg-black/40 border border-${theme}-900 rounded p-2`}>
                            <div className="flex items-center justify-between mb-2">
                                <div className="min-w-0">
                                    <div className={`text-sm text-${theme}-300 truncate`}>{tv.name}</div>
                                    <div className={`text-[10px] text-${theme}-700 truncate`}>{tv.model || tv.host}</div>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded ${s.cls}`}>{s.text}</span>
                            </div>

                            {!tv.paired ? (
                                <button onClick={() => pair(tv)} disabled={any || !tv.reachable} className={`${btn} w-full`}>
                                    {spin(tv, 'pair', Link2)} {tv.reachable ? 'Pair with TV' : 'Turn the TV on to pair'}
                                </button>
                            ) : (
                                <>
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        <button onClick={() => run(tv, on ? 'power-off' : 'power-on')} disabled={any} className={btn}>
                                            {spin(tv, on ? 'power-off' : 'power-on', Power)} {on ? 'Off' : 'On'}
                                        </button>
                                        <button onClick={() => run(tv, tv.artMode === 'on' ? 'art-off' : 'art-on')} disabled={any}
                                            className={`${btn} ${tv.artMode === 'on' ? 'border-purple-600 text-purple-300' : ''}`}>
                                            {spin(tv, tv.artMode === 'on' ? 'art-off' : 'art-on', Palette)} {tv.artMode === 'on' ? 'Watch TV' : 'Art mode'}
                                        </button>
                                        <button onClick={() => run(tv, 'key', 'KEY_HOME')} disabled={any || !on} className={btn}>
                                            {spin(tv, 'KEY_HOME', Home)} Home
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => run(tv, 'key', 'KEY_VOLDOWN')} disabled={any || !on} className={btn} aria-label="Volume down">
                                            {spin(tv, 'KEY_VOLDOWN', Volume1)}
                                        </button>
                                        <button onClick={() => run(tv, 'key', 'KEY_MUTE')} disabled={any || !on} className={btn} aria-label="Mute">
                                            {spin(tv, 'KEY_MUTE', VolumeX)}
                                        </button>
                                        <button onClick={() => run(tv, 'key', 'KEY_VOLUP')} disabled={any || !on} className={btn} aria-label="Volume up">
                                            {spin(tv, 'KEY_VOLUP', Volume2)}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FrameTvWidget;
