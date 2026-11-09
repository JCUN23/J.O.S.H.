import { BACKEND_URL } from '../config';
import { inferCapabilities } from './goveeCapabilities';
import ColorStudio from './ColorStudio';
import { useEffect, useState, useCallback, useRef } from "react";
import {
    Lightbulb,
    Power,
    Loader2,
    RefreshCw,
    Palette,
    Sun,
    Droplet,
    Lock
} from "lucide-react";


const SEND_DEBOUNCE_MS = 350; // color picker/slider fire continuously while dragging

const GoveeWidget = ({ theme, setGoveeIsConnected }) => {
    const [devices, setDevices] = useState([]);
    const [selected, setSelected] = useState(null);
    const [caps, setCaps] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [rateLimited, setRateLimited] = useState(false);
    const [rateLimitMsg, setRateLimitMsg] = useState("");
    const [online, setOnline] = useState(null); // null = unknown
    const [controlError, setControlError] = useState("");
    const debounceRef = useRef(null);


    const border = `border-${theme}-800`;
    const bg = `bg-${theme}-950/30`;
    const text = `text-${theme}-400`;

    const loadDevices = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${BACKEND_URL}/api/govee/devices`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const list = json?.data?.devices || [];
            setDevices(list);
            setSelected(list[0] || null);
            setCaps(list[0] ? inferCapabilities(list[0]) : null);
            setGoveeIsConnected(true);
            setError("");
        } catch {
            setError("Couldn't reach Govee. Check GOVEE_API_KEY in backend/.env, then refresh.");
            setGoveeIsConnected(false);
        } finally {
            setLoading(false);
        }
    }, [setGoveeIsConnected]);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    // Govee's cloud can only reach devices it sees as online. Check on select so an
    // offline device says so instead of silently ignoring commands.
    useEffect(() => {
        if (!selected) return;
        let alive = true;
        setOnline(null);
        setControlError("");
        fetch(`${BACKEND_URL}/api/govee/state/${encodeURIComponent(selected.device)}/${selected.model}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => {
                if (!alive || !j) return;
                const props = Object.assign({}, ...(j.data?.properties || []));
                setOnline(props.online !== false && props.online !== "false");
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [selected]);

    const send = async (cmd) => {
        if (!selected || sending || rateLimited) return;

        try {
            setSending(true);

            const res = await fetch(`${BACKEND_URL}/api/govee/control`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    device: selected.device,
                    model: selected.model,
                    cmd,
                }),
            });

            const data = await res.json().catch(() => ({}));
            setControlError("");

            if (res.status === 429 || data?.code === 429) {
                setRateLimited(true);
                setRateLimitMsg("Rate limit exceeded — cooling down…");

                // 2 second visible cooldown (safe for Govee)
                setTimeout(() => {
                    setRateLimited(false);
                    setRateLimitMsg("");
                }, 2000);
            } else if (!res.ok || (data?.code && data.code !== 200)) {
                // Govee reports many failures in-band (HTTP 200 + { code, message })
                const msg = data?.message || data?.error?.message || data?.error || `HTTP ${res.status}`;
                setControlError(`Govee rejected that: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
            }
        } catch (e) {
            console.error("Govee control failed", e);
            setControlError("Couldn't reach Sentinel's backend.");
        } finally {
            setSending(false);
        }
    };


    const setColor = (r, g, b) =>
        send({ name: "color", value: { r, g, b } });

    // Send once the user stops dragging, not on every intermediate value
    // (Govee's cloud allows only a handful of commands per device per minute).
    const sendDebounced = (cmd) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => send(cmd), SEND_DEBOUNCE_MS);
    };
    useEffect(() => () => clearTimeout(debounceRef.current), []);



    if (loading) {
        return (
            <div className={`${bg} border ${border} p-6`}>
                <Loader2 className={`animate-spin ${text}`} />
            </div>
        );
    }

    return (<div className={`${bg} border ${border} rounded-lg p-4 pb-6 max-h-80 overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <Lightbulb className={`text-${theme}-400`} />
                <h3 className={`text-lg font-semibold text-${theme}-400`}>GOVEE</h3>
            </div>
            {error && (
                <button onClick={loadDevices} className={`text-xs px-2 py-1 rounded border ${border} ${text}`}>
                    Retry
                </button>
            )}
        </div>
        {error && <div className="text-xs text-red-400 mb-2 px-4">{error}</div>}
        <div className={`p-4 grid grid-cols-3 gap-4 text-${theme}-300`}>
            {/* DEVICE LIST */}
            <div className="col-span-1 space-y-2 max-h-80 overflow-y-auto">
                {devices.map((d) => (
                    <button
                        key={d.device}
                        onClick={() => {
                            setSelected(d);
                            setCaps(inferCapabilities(d));
                        }}
                        className={`w-full text-left p-2 rounded border ${selected?.device === d.device
                            ? `border-${theme}-500`
                            : border
                            }`}
                    >
                        <div className="font-semibold">{d.deviceName}</div>
                        <div className="text-xs opacity-60">{d.model}</div>
                    </button>
                ))}
            </div>

            {rateLimited && (
                <div className="bg-yellow-900/40 border border-yellow-700 rounded p-3 text-yellow-300 text-xs font-mono flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {rateLimitMsg || "Rate limit exceeded"}
                </div>
            )}


            {/* CONTROLS */}
            {selected && caps && (
                <div className="col-span-2 space-y-3">
                    {online === false && (
                        <div className="text-xs text-yellow-400 border border-yellow-700/60 rounded p-2">
                            Offline in Govee's cloud, so commands can't reach it. Power-cycle it, or
                            reconnect it to 2.4 GHz Wi-Fi in the Govee Home app.
                        </div>
                    )}
                    {controlError && <div className="text-xs text-red-400">{controlError}</div>}
                    {caps.readOnly && (
                        <div className="flex items-center gap-2 text-yellow-400 text-xs">
                            <Lock size={14} />
                            Power only (this model ignores color/brightness via the API)
                        </div>
                    )}

                    {/* POWER */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => send({ name: "turn", value: "on" })}
                            disabled={sending || rateLimited}
                            className={`bg-green-600 text-white py-2 rounded ${sending || rateLimited ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            ON
                        </button>
                        <button
                            onClick={() => send({ name: "turn", value: "off" })}
                            disabled={sending || rateLimited}
                            className={`bg-red-600 text-white py-2 rounded ${sending || rateLimited ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            OFF
                        </button>
                    </div>
                    <div>

                    {/* BRIGHTNESS */}
                    {caps.brightness && (
                        <div>
                            <Sun size={14} className={text} />
                            <input
                                type="range"
                                min="1"
                                max="100"
                                // onChange + debounce works for touch too (onMouseUp often
                                // never fires on a touchscreen)
                                onChange={(e) =>
                                    sendDebounced({ name: "brightness", value: +e.target.value })
                                }
                                className="w-full"
                            />
                        </div>
                    )}

                    {/* COLORS: any RGB. Sent on release only: Govee's cloud allows a handful
                        of commands per device per minute, so no live preview while dragging. */}
                    {caps.color && (
                        <ColorStudio theme={theme} disabled={sending || rateLimited}
                            onCommit={({ r, g, b }) => setColor(r, g, b)}
                            note="Sets when you let go (Govee's cloud only takes a few commands a minute)." />
                    )}

                    {/* TEMPERATURE */}
                    {caps.temperature && (
                        <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => send({ name: "colorTem", value: 2000 })}>
                                Warm
                            </button>
                            <button onClick={() => send({ name: "colorTem", value: 5500 })}>
                                Neutral
                            </button>
                            <button onClick={() => send({ name: "colorTem", value: 9000 })}>
                                Cool
                            </button>
                        </div>
                    )}
                    </div>
                </div>
            )}
        </div>
    </div>);
};

export default GoveeWidget;
