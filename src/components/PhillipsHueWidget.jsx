import { useEffect, useState, useCallback } from 'react';
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

    const BACKEND_URL = 'http://localhost:3001';

    const loadLights = useCallback(async () => {
        try {
            setLoading(true);
            setHueIsConnected(false);
            setError('');

            const [lightsRes, groupsRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/hue/lights`),
                fetch(`${BACKEND_URL}/api/hue/groups`)
            ]);

            const lightsData = await lightsRes.json();
            const groupsData = await groupsRes.json();

            if (lightsData.error) {
                setError(lightsData.error);
                setLoading(false);
                setHueIsConnected(false);
                return;
            }

            // Convert objects to arrays
            const lightsArray = Object.entries(lightsData).map(([id, light]) => ({
                id,
                ...light
            }));

            const groupsArray = Object.entries(groupsData).map(([id, group]) => ({
                id,
                ...group
            })).filter(g => g.type === 'Room' || g.type === 'Zone');

            setLights(lightsArray);
            setGroups(groupsArray);

            if (lightsArray.length > 0) {
                setSelectedLight(lightsArray[0]);
            }

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
                loadLights();
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
                loadLights();
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

    const setColor = (hue, sat) => {
        if (selectedLight) {
            controlLight(selectedLight.id, { hue: parseInt(hue), sat: parseInt(sat) });
        }
    };

    const handleColorPicker = (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // Convert RGB to Hue HSB
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let hue = 0;
        if (delta !== 0) {
            if (max === r) {
                hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
            } else if (max === g) {
                hue = ((b - r) / delta + 2) / 6;
            } else {
                hue = ((r - g) / delta + 4) / 6;
            }
        }

        const sat = max === 0 ? 0 : delta / max;

        setColor(Math.round(hue * 65535), Math.round(sat * 254));
    };

    const presetColors = [
        { name: 'Red', hue: 0, sat: 254 },
        { name: 'Orange', hue: 5000, sat: 254 },
        { name: 'Yellow', hue: 12750, sat: 254 },
        { name: 'Green', hue: 25500, sat: 254 },
        { name: 'Cyan', hue: 36210, sat: 254 },
        { name: 'Blue', hue: 46920, sat: 254 },
        { name: 'Purple', hue: 52428, sat: 254 },
        { name: 'Pink', hue: 56100, sat: 254 },
        { name: 'White', hue: 0, sat: 0 },
    ];

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
                    onClick={loadLights}
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
                        onClick={loadLights}
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
                    onClick={loadLights}
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
                    onChange={(e) => setSelectedLight(lights.find(l => l.id === e.target.value))}
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
                            {selectedLight.state.on && (
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
                                    defaultValue={selectedLight.state.bri || 127}
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
                            <div className="p-3 pt-0 space-y-3">
                                {/* Color Picker */}
                                <div>
                                    <div className={`text-xs text-${theme}-600 mb-2`}>Custom Color</div>
                                    <input
                                        type="color"
                                        onChange={handleColorPicker}
                                        className="h-12 w-full rounded cursor-pointer"
                                        title="Pick any color"
                                    />
                                </div>

                                {/* Preset Colors */}
                                <div>
                                    <div className={`text-xs text-${theme}-600 mb-2`}>Quick Presets</div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {presetColors.map(color => (
                                            <button
                                                key={color.name}
                                                onClick={() => setColor(color.hue, color.sat)}
                                                disabled={sending}
                                                className={`h-12 rounded border-2 border-white/20 hover:border-white/60 transition-all ${sending ? 'opacity-50' : ''}`}
                                                style={{
                                                    backgroundColor: color.name === 'White' ? '#ffffff' :
                                                        `hsl(${color.hue / 182}, ${color.sat / 2.54}%, 50%)`
                                                }}
                                                title={color.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhilipsHueWidget;