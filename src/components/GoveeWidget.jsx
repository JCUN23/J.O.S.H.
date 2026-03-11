import { useEffect, useState, useCallback } from "react";
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

const BACKEND_URL = "http://localhost:3001";

const inferCapabilities = (device) => {
    const model = device.model?.toUpperCase() || "";
    const readOnly = model.startsWith("H6076");

    return {
        power: true,
        brightness: !readOnly,
        color: !readOnly,
        temperature: !readOnly,
        readOnly,
    };
};

const GoveeWidget = ({ theme, setGoveeIsConnected }) => {
    const [devices, setDevices] = useState([]);
    const [selected, setSelected] = useState(null);
    const [caps, setCaps] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [rateLimited, setRateLimited] = useState(false);
    const [rateLimitMsg, setRateLimitMsg] = useState("");


    const border = `border-${theme}-800`;
    const bg = `bg-${theme}-950/30`;
    const text = `text-${theme}-400`;

    const loadDevices = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${BACKEND_URL}/api/govee/devices`);
            const json = await res.json();
            const list = json?.data?.devices || [];
            setDevices(list);
            setSelected(list[0] || null);
            setCaps(list[0] ? inferCapabilities(list[0]) : null);
            setGoveeIsConnected(true);
        } catch {
            setError("Failed to load Govee devices");
            setGoveeIsConnected(false);
        } finally {
            setLoading(false);
        }
    }, [setGoveeIsConnected]);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

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

            const data = await res.json();

            if (res.status === 429 || data?.code === 429) {
                setRateLimited(true);
                setRateLimitMsg("Rate limit exceeded — cooling down…");

                // 2 second visible cooldown (safe for Govee)
                setTimeout(() => {
                    setRateLimited(false);
                    setRateLimitMsg("");
                }, 2000);
            }
        } catch (e) {
            console.error("Govee control failed", e);
        } finally {
            setSending(false);
        }
    };


    const setColor = (r, g, b) =>
        send({ name: "color", value: { r, g, b } });

    const presetColors = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
        [0, 255, 255],
        [255, 0, 255],
        [255, 255, 255],
    ];

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
                <h3 className={`text-lg font-semibold text-${theme}-400`}>Govee</h3>
            </div>
        </div>
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
                    {caps.readOnly && (
                        <div className="flex items-center gap-2 text-yellow-400 text-xs">
                            <Lock size={14} />
                            Read-only device (Govee API limitation)
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
                                onMouseUp={(e) =>
                                    send({ name: "brightness", value: +e.target.value })
                                }
                                className="w-full"
                            />
                        </div>
                    )}

                    {/* COLORS */}
                    {caps.color && (
                        <>
                            <input
                                type="color"
                                onChange={(e) => {
                                    const c = e.target.value;
                                    setColor(
                                        parseInt(c.slice(1, 3), 16),
                                        parseInt(c.slice(3, 5), 16),
                                        parseInt(c.slice(5, 7), 16)
                                    );
                                }}
                                className="w-full h-10"
                            />
                            <div className="grid grid-cols-7 gap-2">
                                {presetColors.map(([r, g, b], i) => (
                                    <button
                                        key={i}
                                        onClick={() => setColor(r, g, b)}
                                        style={{ backgroundColor: `rgb(${r},${g},${b})` }}
                                        className="h-8 rounded"
                                    />
                                ))}
                            </div>
                        </>
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
