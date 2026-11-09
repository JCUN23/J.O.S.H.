import { BACKEND_URL } from '../config';
import { useEffect, useState, useCallback, useRef } from 'react';
import ColorStudio from './ColorStudio';
import { keepSelected, saveSelected } from '../utils/selectedDevice';
import { rgbToXy } from '../utils/color';
import { Lightbulb, Power, Loader2, RefreshCw, Palette, ChevronDown, ChevronUp, Sun } from 'lucide-react';

const PhilipsHueWidget = ({ theme, setHueIsConnected }) => {
    const [lights, setLights] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedLight, setSelectedLight] = useState(null);
    const [sending, setSending] = useState(false);

    // Collapsible sections
    const [showBrightness, setShowBrightness] = useState(false);
    const [showColors, setShowColors] = useState(false);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;


    // quiet: a refresh after a change. No spinner (it unmounted everything: open sections
    // collapsed) and the selected light stays selected (it used to snap back to the first).
    const loadLights = useCallback(async ({ quiet = false } = {}) => {
        try {
            if (!quiet) { setLoading(true); setHueIsConnected(false); }
            setError('');

            const [lightsRes, groupsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/hue/lights`),
                fetch(`${BACKEND_URL}/api/hue/groups`)
            ]);

            const lightsData = await lightsRes.json();
            const groupsData = await groupsRes.json();

            if (!lightsRes.ok || lightsData.error) {
                setError(lightsData.error || `Hue bridge unavailable (HTTP ${lightsRes.status})`);
                setLoading(false);
                setHueIsConnected(false);
                return;
            }

            // Convert objects to arrays
            // Only entries that are actually lights (have a state object)
            const lightsArray = Object.entries(lightsData)
                .filter(([, light]) => light && typeof light.state === 'object')
                .map(([id, light]) => ({ id, ...light }));

            const groupsArray = Object.entries(groupsRes.ok ? groupsData : {}).map(([id, group]) => ({
                id,
                ...group
            })).filter(g => g.type === 'Room' || g.type === 'Zone');

            setLights(lightsArray);
            setGroups(groupsArray);

            setSelectedLight((cur) => keepSelected(lightsArray, (l) => l.id, cur?.id, 'hue'));

            setLoading(false);
            setHueIsConnected(true);
        } catch (err) {
            console.error('Failed to load Hue lights:', err);
            setError('Failed to connect. Make sure Hue Bridge is configured in .env');
            setLoading(false);
            setHueIsConnected(false);
        }
    }, [setHueIsConnected]);

    useEffect(() => {
        loadLights();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const controlLight = async (lightId, state) => {
        if (sending) return;

        try {
            setSending(true);
            await fetch(`${BACKEND_URL}/api/hue/lights/${lightId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state })
            });

            setTimeout(() => {
                setSending(false);
                loadLights({ quiet: true });
            }, 500);
        } catch (err) {
            console.error('Control error:', err);
            setError('Failed to control light');
            setSending(false);
        }
    };

    const controlGroup = async (groupId, action) => {
        if (sending) return;

        try {
            setSending(true);
            await fetch(`${BACKEND_URL}/api/hue/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });

            setTimeout(() => {
                setSending(false);
                loadLights({ quiet: true });
            }, 500);
        } catch (err) {
            console.error('Control error:', err);
            setError('Failed to control group');
            setSending(false);
        }
    };

    const togglePower = (on) => {
        if (selectedLight) {
            controlLight(selectedLight.id, { on });
        }
    };

    const setBrightness = (value) => {
        if (selectedLight) {
            controlLight(selectedLight.id, { bri: parseInt(value) });
        }
    };

    // Live color while dragging: straight to the bridge (local network, fast), at most
    // every 150 ms, skipping the busy flag and reload. The release goes through
    // controlLight. xy is Philips' own color space, so hex codes look right on the bulb.
    const preview = useRef({ at: 0, timer: null, last: null });
    const previewColor = (rgb) => {
        if (!selectedLight) return;
        const p = preview.current;
        p.last = rgb;
        const sendNow = () => {
            p.at = Date.now(); p.timer = null;
            fetch(`${BACKEND_URL}/api/hue/lights/${selectedLight.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: { on: true, xy: rgbToXy(p.last) } }),
            }).catch(() => {});
        };
        const wait = 150 - (Date.now() - p.at);
        if (wait <= 0) sendNow();
        else if (!p.timer) p.timer = setTimeout(sendNow, wait);
    };
    const commitColor = (rgb) => {
        clearTimeout(preview.current.timer); preview.current.timer = null;
        if (selectedLight) controlLight(selectedLight.id, { on: true, xy: rgbToXy(rgb) });
    };
    useEffect(() => () => clearTimeout(preview.current.timer), []);

    if (loading) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col items-center justify-center`}>
                <Loader2 className={`animate-spin ${textClass} mb-4`} size={32} />
                <div className={`text-sm text-${theme}-600`}>
                    Loading Philips Hue lights...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col`}>
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>PHILIPS HUE</h3>
                </div>
                <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-400 text-sm mb-4">
                    {error}
                </div>
                <button
                    onClick={() => loadLights()}
                    className={`flex items-center justify-center gap-2 bg-${theme}-700 hover:bg-${theme}-600 text-white px-4 py-2 rounded transition-all font-mono text-sm`}
                >
                    <RefreshCw size={16} />
                    Retry
                </button>
                <div className={`mt-4 text-xs text-${theme}-700`}>
                    <p className="mb-2">To connect Philips Hue:</p>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Find your Hue Bridge IP (check router or Hue app)</li>
                        <li>Press the button on your Hue Bridge</li>
                        <li>Visit: http://YOUR_BRIDGE_IP/debug/clip.html</li>
                        <li>Create user and get username</li>
                        <li>Add HUE_BRIDGE_IP and HUE_USERNAME to backend/.env</li>
                    </ol>
                </div>
            </div>
        );
    }

    if (lights.length === 0) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col`}>
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className={textClass} size={20} />
                    <h3 className="text-lg font-semibold">PHILIPS HUE</h3>
                </div>
                <div className="text-center py-8">
                    <div className={`text-sm text-${theme}-600 mb-4`}>
                        No Hue lights found
                    </div>
                    <button
                        onClick={() => loadLights()}
                        className={`flex items-center justify-center gap-2 bg-${theme}-700 hover:bg-${theme}-600 text-white px-4 py-2 rounded transition-all font-mono text-sm mx-auto`}
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Lightbulb className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>PHILIPS HUE</h3>
                </div>
                <button
                    onClick={() => loadLights()}
                    className={`text-${theme}-500 hover:text-${theme}-400 transition-colors`}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Room/Group Controls */}
            {groups.length > 0 && (
                <div className="mb-4 space-y-2">
                    <div className={`text-xs text-${theme}-600 mb-2`}>Quick Rooms</div>
                    <div className="grid grid-cols-2 gap-2">
                        {groups.slice(0, 4).map(group => (
                            <button
                                key={group.id}
                                onClick={() => controlGroup(group.id, { on: !group.state?.any_on })}
                                disabled={sending}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded transition-all text-sm ${group.state?.any_on
                                        ? 'bg-yellow-600 hover:bg-yellow-700'
                                        : 'bg-gray-700 hover:bg-gray-600'
                                    } text-white ${sending ? 'opacity-50' : ''}`}
                            >
                                <Lightbulb size={14} />
                                {group.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Light Selector */}
            {lights.length > 1 && (
                <select
                    value={selectedLight?.id}
                    aria-label="Hue light"
                    onChange={(e) => { const l = lights.find((x) => x.id === e.target.value); setSelectedLight(l); saveSelected('hue', l?.id); }}
                    className={`w-full bg-black/50 border ${borderClass} rounded px-3 py-2 ${textClass} font-mono text-sm mb-4 focus:outline-none`}
                >
                    {lights.map(light => (
                        <option key={light.id} value={light.id}>
                            {light.name}
                        </option>
                    ))}
                </select>
            )}

            {selectedLight && (
                <div className="space-y-3">
                    {/* Light Info */}
                    <div className={`bg-black/50 border ${borderClass} rounded p-3`}>
                        <div className={`font-semibold text-${theme}-300 mb-1 flex items-center gap-2`}>
                            {selectedLight.name}
                            {selectedLight.state?.on && (
                                <span className="text-xs bg-yellow-600/30 text-yellow-400 px-2 py-0.5 rounded">ON</span>
                            )}
                        </div>
                        <div className={`text-xs text-${theme}-700`}>
                            {selectedLight.type}
                        </div>
                    </div>

                    {/* Power Toggle */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => togglePower(true)}
                            disabled={sending}
                            className={`flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded transition-all font-mono ${sending ? 'opacity-50' : ''}`}
                        >
                            <Power size={18} />
                            ON
                        </button>
                        <button
                            onClick={() => togglePower(false)}
                            disabled={sending}
                            className={`flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded transition-all font-mono ${sending ? 'opacity-50' : ''}`}
                        >
                            <Power size={18} />
                            OFF
                        </button>
                    </div>

                    {/* Brightness */}
                    <div className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
                        <button
                            onClick={() => setShowBrightness(!showBrightness)}
                            className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}
                        >
                            <div className="flex items-center gap-2">
                                <Sun size={16} className={textClass} />
                                <span className={`text-sm font-semibold text-${theme}-400`}>Brightness</span>
                            </div>
                            {showBrightness ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
                        </button>
                        {showBrightness && (
                            <div className="p-3 pt-0">
                                <input
                                    type="range"
                                    min="1"
                                    max="254"
                                    key={selectedLight.id}
                                    defaultValue={selectedLight.state?.bri || 127}
                                    onMouseUp={(e) => setBrightness(e.target.value)}
                                    onTouchEnd={(e) => setBrightness(e.target.value)}
                                    className="w-full"
                                />
                            </div>
                        )}
                    </div>

                    {/* Colors */}
                    <div className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
                        <button
                            onClick={() => setShowColors(!showColors)}
                            className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}
                        >
                            <div className="flex items-center gap-2">
                                <Palette size={16} className={textClass} />
                                <span className={`text-sm font-semibold text-${theme}-400`}>Colors</span>
                            </div>
                            {showColors ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
                        </button>
                        {showColors && (
                            <div className="p-3 pt-0">
                                <ColorStudio key={selectedLight.id} theme={theme} disabled={sending} onPreview={previewColor} onCommit={commitColor}
                                    note="Changes live while you drag." />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhilipsHueWidget;