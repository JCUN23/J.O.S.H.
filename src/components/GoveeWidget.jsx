import { BACKEND_URL } from '../config';
import { inferCapabilities } from './goveeCapabilities';
import ColorStudio from './ColorStudio';
import { keepSelected, saveSelected } from '../utils/selectedDevice';
import { useEffect, useState, useCallback, useRef } from "react";
import { Lightbulb, Power, Loader2, RefreshCw, Palette, Sun, Thermometer, Lock, ChevronDown, ChevronUp } from "lucide-react";

const SEND_DEBOUNCE_MS = 350;      // sliders fire continuously while dragging
const STATE_REFRESH_MS = 2500;     // re-read the device's state after a change (Govee is eventually consistent)

// Same layout as the Philips Hue widget: pick a light, see its state, power, then
// collapsible brightness / color / white sections. The selected light sticks through
// refreshes (utils/selectedDevice.js).
const GoveeWidget = ({ theme, setGoveeIsConnected }) => {
    const [devices, setDevices] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [rateLimited, setRateLimited] = useState(false);
    const [device, setDevice] = useState({ online: null, on: null, brightness: null });   // live state of the selected light
    const [controlError, setControlError] = useState("");
    const [open, setOpen] = useState({ brightness: false, colors: false, white: false });
    const debounceRef = useRef(null);
    const refreshRef = useRef(null);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;
    const caps = selected ? inferCapabilities(selected) : null;

    const loadDevices = useCallback(async ({ quiet = false } = {}) => {
        try {
            if (!quiet) setLoading(true);
            const res = await fetch(`${BACKEND_URL}/api/govee/devices`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const list = (await res.json())?.data?.devices || [];
            setDevices(list);
            setSelected((cur) => keepSelected(list, (d) => d.device, cur?.device, 'govee'));
            setGoveeIsConnected(true);
            setError("");
        } catch {
            setError("Couldn't reach Govee. Check GOVEE_API_KEY in backend/.env, then refresh.");
            setGoveeIsConnected(false);
        } finally {
            setLoading(false);
        }
    }, [setGoveeIsConnected]);

    useEffect(() => { loadDevices(); }, [loadDevices]);

    // Live state of the selected light (Govee's cloud only reaches devices it sees online)
    const loadState = useCallback(async (d) => {
        if (!d) return;
        try {
            const r = await fetch(`${BACKEND_URL}/api/govee/state/${encodeURIComponent(d.device)}/${d.model}`);
            const j = r.ok ? await r.json() : null;
            const props = Object.assign({}, ...(j?.data?.properties || []));
            setDevice({
                online: props.online !== false && props.online !== "false",
                on: props.powerState ? props.powerState === "on" : null,
                brightness: Number.isFinite(props.brightness) ? props.brightness : null,
            });
        } catch { /* keep what we had */ }
    }, []);

    useEffect(() => {
        if (!selected) return undefined;
        saveSelected('govee', selected.device);
        setDevice({ online: null, on: null, brightness: null });
        setControlError("");
        loadState(selected);
        return () => clearTimeout(refreshRef.current);
    }, [selected, loadState]);

    const send = async (cmd) => {
        if (!selected || sending || rateLimited) return;
        try {
            setSending(true);
            const res = await fetch(`${BACKEND_URL}/api/govee/control`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ device: selected.device, model: selected.model, cmd }),
            });
            const data = await res.json().catch(() => ({}));
            setControlError("");
            if (res.status === 429 || data?.code === 429) {
                setRateLimited(true);                                   // short visible cooldown
                setTimeout(() => setRateLimited(false), 2000);
            } else if (!res.ok || (data?.code && data.code !== 200)) {
                // Govee reports many failures in-band (HTTP 200 + { code, message })
                const msg = data?.message || data?.error?.message || data?.error || `HTTP ${res.status}`;
                setControlError(`Govee rejected that: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
            } else {
                if (cmd.name === "turn") setDevice((s) => ({ ...s, on: cmd.value === "on" }));
                clearTimeout(refreshRef.current);
                refreshRef.current = setTimeout(() => loadState(selected), STATE_REFRESH_MS);
            }
        } catch {
            setControlError("Couldn't reach Sentinel's backend.");
        } finally {
            setSending(false);
        }
    };

    // Send once the user stops dragging (Govee allows only a few commands per device per minute)
    const sendDebounced = (cmd) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => send(cmd), SEND_DEBOUNCE_MS);
    };
    useEffect(() => () => { clearTimeout(debounceRef.current); clearTimeout(refreshRef.current); }, []);

    // A render helper, not a component: a component defined in here would be a new type
    // every render, remounting what's inside (a half-dragged slider or color would reset).
    const section = (id, Icon, label, body) => (
        <div className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
            <button onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}
                className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}>
                <div className="flex items-center gap-2">
                    <Icon size={16} className={textClass} />
                    <span className={`text-sm font-semibold text-${theme}-400`}>{label}</span>
                </div>
                {open[id] ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
            </button>
            {open[id] && <div className="p-3 pt-0">{body}</div>}
        </div>
    );

    const header = (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
                <Lightbulb className={textClass} size={20} />
                <h3 className={`text-lg font-semibold text-${theme}-400`}>GOVEE</h3>
            </div>
            <button onClick={() => loadDevices({ quiet: true })} aria-label="Refresh Govee" className={`text-${theme}-500 hover:text-${theme}-400 transition-colors`}>
                <RefreshCw size={16} />
            </button>
        </div>
    );

    if (loading) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col items-center justify-center`}>
                <Loader2 className={`animate-spin ${textClass} mb-4`} size={32} />
                <div className={`text-sm text-${theme}-600`}>Connecting to Govee…</div>
            </div>
        );
    }

    if (error || !devices.length) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col`}>
                {header}
                <div className={error ? 'bg-red-900/30 border border-red-700 rounded p-4 text-red-400 text-sm mb-4' : `text-sm text-${theme}-600 mb-4`}>
                    {error || 'No Govee devices found'}
                </div>
                <button onClick={() => loadDevices()} className={`flex items-center justify-center gap-2 bg-${theme}-700 hover:bg-${theme}-600 text-white px-4 py-2 rounded transition-all font-mono text-sm`}>
                    <RefreshCw size={16} /> Retry
                </button>
            </div>
        );
    }

    const busy = sending || rateLimited;
    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col`}>
            {header}

            {/* Light Selector */}
            {devices.length > 1 && (
                <select
                    aria-label="Govee light"
                    value={selected?.device || ''}
                    onChange={(e) => setSelected(devices.find((d) => d.device === e.target.value))}
                    className={`w-full bg-black/50 border ${borderClass} rounded px-3 py-2 ${textClass} font-mono text-sm mb-4 focus:outline-none`}
                >
                    {devices.map((d) => <option key={d.device} value={d.device}>{d.deviceName}</option>)}
                </select>
            )}

            {selected && caps && (
                <div className="space-y-3">
                    {/* Light Info */}
                    <div className={`bg-black/50 border ${borderClass} rounded p-3`}>
                        <div className={`font-semibold text-${theme}-300 mb-1 flex items-center gap-2`}>
                            {selected.deviceName}
                            {device.on && <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded">ON</span>}
                            {device.online === false && <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">OFFLINE</span>}
                        </div>
                        <div className={`text-xs text-${theme}-700`}>
                            {selected.model}{caps.readOnly && ' · power only'}{device.brightness != null && ` · ${device.brightness}%`}
                        </div>
                    </div>

                    {device.online === false && (
                        <div className="text-xs text-yellow-400 border border-yellow-700/60 rounded p-2">
                            Offline in Govee's cloud, so commands can't reach it. Power-cycle it, or
                            reconnect it to 2.4 GHz Wi-Fi in the Govee Home app.
                        </div>
                    )}
                    {controlError && <div className="text-xs text-red-400">{controlError}</div>}
                    {rateLimited && (
                        <div className="bg-yellow-900/40 border border-yellow-700 rounded p-2 text-yellow-300 text-xs font-mono flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" /> Govee rate limit, cooling down…
                        </div>
                    )}
                    {caps.readOnly && (
                        <div className="flex items-center gap-2 text-yellow-400 text-xs">
                            <Lock size={14} /> Power only (this model ignores color/brightness via the API)
                        </div>
                    )}

                    {/* Power Toggle */}
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => send({ name: "turn", value: "on" })} disabled={busy}
                            className={`flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded transition-all font-mono ${busy ? 'opacity-50' : ''}`}>
                            <Power size={18} /> ON
                        </button>
                        <button onClick={() => send({ name: "turn", value: "off" })} disabled={busy}
                            className={`flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded transition-all font-mono ${busy ? 'opacity-50' : ''}`}>
                            <Power size={18} /> OFF
                        </button>
                    </div>

                    {caps.brightness && section('brightness', Sun, 'Brightness', (
                        <input type="range" min="1" max="100" aria-label="Brightness"
                            key={selected.device} defaultValue={device.brightness ?? 50}
                            onChange={(e) => sendDebounced({ name: "brightness", value: +e.target.value })}
                            className="w-full" />
                    ))}

                    {caps.color && section('colors', Palette, 'Colors', (
                        <ColorStudio key={selected.device} theme={theme} disabled={busy}
                            onCommit={({ r, g, b }) => send({ name: "color", value: { r, g, b } })}
                            note="Sets when you let go (Govee's cloud only takes a few commands a minute)." />
                    ))}

                    {caps.temperature && section('white', Thermometer, 'White', (
                            <div className="grid grid-cols-3 gap-2">
                                {[['Warm', 2000], ['Neutral', 5500], ['Cool', 9000]].map(([label, k]) => (
                                    <button key={label} onClick={() => send({ name: "colorTem", value: k })} disabled={busy}
                                        className={`bg-black/50 border ${borderClass} rounded py-2 text-sm text-${theme}-300 hover:border-${theme}-600 ${busy ? 'opacity-50' : ''}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GoveeWidget;
