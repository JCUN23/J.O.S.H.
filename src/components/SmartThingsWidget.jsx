import { useEffect, useState, useCallback, useRef } from 'react';
import {
    Tv,
    Volume2,
    VolumeX,
    Power,
    Loader2,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Palette,
    Monitor,
    Speaker,
    Home,
    Lightbulb,
    Thermometer,
    Lock,
    Play,
    Pause,
    SkipForward,
    SkipBack,
    FastForward,
    Rewind
} from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:3001';

const SmartThingsWidget = ({ theme, setSmartThingsIsConnected }) => {
    const [, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [frameTV, setFrameTV] = useState(null);
    const [audioSystem, setAudioSystem] = useState(null);
    const [otherDevices, setOtherDevices] = useState([]);
    const [sending, setSending] = useState(false);
    const [rateLimited, setRateLimited] = useState(false);
    const [retryIn, setRetryIn] = useState(0);
    const [expandedDevices, setExpandedDevices] = useState({});
    const [showAudio, setShowAudio] = useState(true);

    // Collapsible sections
    const [showOther, setShowOther] = useState(true);

    // Prevent duplicate loads on mount/remount
    const hasLoadedRef = useRef(false);
    const statusFetchedRef = useRef(false);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;

    const loadDevices = useCallback(async (bypassRateLimit = false) => {
        if (rateLimited && !bypassRateLimit) return;

        try {
            setLoading(true);
            setSmartThingsIsConnected(false);
            setError('');
            setRateLimited(false);

            const response = await fetch(`${BACKEND_URL}/api/smartthings/devices`);
            const data = await response.json();

            const rateLimitError = data.error?.error?.code === 'TooManyRequestError' ||
                data.error?.code === 'TooManyRequestError';

            if (rateLimitError) {
                const details = data.error?.error?.details?.[0] || data.error?.details?.[0];
                const retryMessage = details?.message || '';
                const retryTime = retryMessage.match(/retry in (\d+) millis/)?.[1];
                const waitSeconds = retryTime ? Math.ceil(parseInt(retryTime) / 1000) : 30;

                setRateLimited(true);
                setRetryIn(waitSeconds);
                setError(`SmartThings rate limit (10 req/10sec). Auto-retrying in ${waitSeconds}s...`);

                const countdown = setInterval(() => {
                    setRetryIn(prev => {
                        if (prev <= 1) {
                            clearInterval(countdown);
                            setRateLimited(false);
                            setError('');
                            setTimeout(() => loadDevices(true), 500);
                            return 0;
                        }
                        setError(`SmartThings rate limit. Auto-retrying in ${prev - 1}s...`);
                        return prev - 1;
                    });
                }, 1000);

                setLoading(false);
                return;
            }

            if (data.needsAuth) {
                setError('SmartThings not connected. Add SMARTTHINGS_TOKEN to backend/.env');
                setLoading(false);
                return;
            }

            if (data.items) {
                setDevices(data.items);

                // Find all Frame TVs
                const frameTVs = data.items.filter(d =>
                    d.label?.toLowerCase().includes('frame') &&
                    d.components?.[0]?.capabilities?.some(c => c.id === 'samsungvd.mediaInputSource')
                );

                // Other TVs and devices
                const otherTVs = data.items.filter(d =>
                    d.label?.toLowerCase().includes('tv') &&
                    !d.label?.toLowerCase().includes('frame')
                );

                const sensors = data.items.filter(d =>
                    !d.label?.toLowerCase().includes('frame') &&
                    !d.label?.toLowerCase().includes('tv')
                );

                console.log('Frame TVs:', frameTVs.map(d => d.label));
                console.log('Other TVs:', otherTVs.map(d => d.label));
                console.log('Sensors:', sensors.map(d => d.label));

                setFrameTV(frameTVs); // Now an array
                setAudioSystem(null);
                setOtherDevices([...otherTVs, ...sensors]);

                setSmartThingsIsConnected(true);
            } else if (data.error) {
                setError(data.error.message || data.error);
            }

            setLoading(false);
        } catch (err) {
            console.error('Failed to load SmartThings devices:', err);
            setError('Failed to connect. Add SMARTTHINGS_TOKEN to backend/.env');
            setLoading(false);
            setSmartThingsIsConnected(false);
        }
    }, [setSmartThingsIsConnected, rateLimited]);

    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        loadDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Only fetch statuses once per mount
        if (statusFetchedRef.current) return;
        if (!frameTV || frameTV.length === 0) return;

        statusFetchedRef.current = true;

        const fetchFrameTVStatuses = async () => {
            try {
                // Fetch statuses sequentially with delays to avoid rate limiting
                const updatedFrameTVs = [];
                for (let i = 0; i < frameTV.length; i++) {
                    const tv = frameTV[i];
                    // Add delay between requests (except first one)
                    if (i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                    try {
                        const statusResponse = await fetch(`${BACKEND_URL}/api/smartthings/devices/${tv.deviceId}/status`);
                        const statusData = await statusResponse.json();

                        updatedFrameTVs.push({
                            ...tv,
                            switch: statusData.components?.main?.switch,
                            audioVolume: statusData.components?.main?.audioVolume,
                            audioMute: statusData.components?.main?.audioMute
                        });
                    } catch (err) {
                        console.error(`Failed to fetch status for ${tv.label}:`, err);
                        updatedFrameTVs.push(tv);
                    }
                }

                setFrameTV(updatedFrameTVs);

                // Expand all Frame TVs by default
                const expanded = {};
                updatedFrameTVs.forEach(tv => {
                    expanded[tv.deviceId] = true;
                });
                setExpandedDevices(expanded);
            } catch (err) {
                console.error('Failed to fetch Frame TV statuses:', err);
            }
        };

        fetchFrameTVStatuses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameTV?.length]);

    const sendCommand = async (deviceId, capability, command, args = []) => {
        if (sending) return;

        try {
            setSending(true);
            await fetch(`${BACKEND_URL}/api/smartthings/devices/${deviceId}/commands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commands: [{
                        capability,
                        command,
                        arguments: args
                    }]
                })
            });

            setTimeout(() => setSending(false), 1500);
        } catch (err) {
            console.error('Command error:', err);
            setError('Failed to send command');
            setSending(false);
        }
    };

    const toggleTVPower = (tv) => tv && sendCommand(tv.deviceId, 'switch', tv.switch?.switch?.value === 'on' ? 'off' : 'on');
    const setTVVolume = (tv, level) => tv && sendCommand(tv.deviceId, 'audioVolume', 'setVolume', [parseInt(level)]);
    const toggleTVMute = (tv) => tv && sendCommand(tv.deviceId, 'audioMute', 'mute');
    const enableArtMode = (tv) => tv && sendCommand(tv.deviceId, 'samsungvd.ambient', 'on');
    const disableArtMode = (tv) => tv && sendCommand(tv.deviceId, 'samsungvd.ambient', 'off');
    const goToHome = (tv) => tv && sendCommand(tv.deviceId, 'samsungvd.remoteControl', 'send', ['HOME']);
    const changeInput = (tv, source) => tv && sendCommand(tv.deviceId, 'samsungvd.mediaInputSource', 'setInputSource', [source]);

    // Playback controls
    const playMedia = (tv) => tv && sendCommand(tv.deviceId, 'mediaPlayback', 'play');
    const pauseMedia = (tv) => tv && sendCommand(tv.deviceId, 'mediaPlayback', 'pause');
    const fastForwardMedia = (tv) => tv && sendCommand(tv.deviceId, 'mediaPlayback', 'fastForward');
    const rewindMedia = (tv) => tv && sendCommand(tv.deviceId, 'mediaPlayback', 'rewind');
    const nextTrack = (tv) => tv && sendCommand(tv.deviceId, 'mediaTrackControl', 'nextTrack');
    const previousTrack = (tv) => tv && sendCommand(tv.deviceId, 'mediaTrackControl', 'previousTrack');

    const toggleAudioPower = () => audioSystem && sendCommand(audioSystem.deviceId, 'switch', audioSystem.switch?.switch?.value === 'on' ? 'off' : 'on');
    const setAudioVolume = (level) => audioSystem && sendCommand(audioSystem.deviceId, 'audioVolume', 'setVolume', [parseInt(level)]);
    const toggleAudioMute = () => audioSystem && sendCommand(audioSystem.deviceId, 'audioMute', 'mute');

    const toggleDevice = async (device) => {
        try {
            const statusResponse = await fetch(`${BACKEND_URL}/api/smartthings/devices/${device.deviceId}/status`);
            const statusData = await statusResponse.json();
            const currentState = statusData.components?.main?.switch?.switch?.value;

            const newState = currentState === 'on' ? 'off' : 'on';
            await sendCommand(device.deviceId, 'switch', newState);
        } catch (err) {
            console.error('Toggle error:', err);
            setError('Failed to toggle device');
        }
    };

    const getDeviceIcon = (device) => {
        const label = device.label?.toLowerCase() || '';
        if (label.includes('light') || label.includes('bulb')) return <Lightbulb size={16} />;
        if (label.includes('lock')) return <Lock size={16} />;
        if (label.includes('thermo')) return <Thermometer size={16} />;
        if (label.includes('tv') || label.includes('frame')) return <Tv size={16} />;
        return <Home size={16} />;
    };

    if (loading) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col items-center justify-center`}>
                <Loader2 className={`animate-spin ${textClass} mb-4`} size={32} />
                <div className={`text-sm text-${theme}-600 mb-2`}>
                    Loading SmartThings devices...
                </div>
                <div className={`text-xs text-${theme}-700 text-center`}>
                    Note: SmartThings limits 10 requests per 10 seconds
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col`}>
                <div className="flex items-center gap-2 mb-4">
                    <Home className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>SMARTTHINGS</h3>
                </div>
                <div className={`${rateLimited ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400' : 'bg-red-900/30 border-red-700 text-red-400'} border rounded p-4 text-sm mb-4`}>
                    {rateLimited ? (
                        <div>
                            <div className="font-bold mb-2 flex items-center gap-2">
                                <RefreshCw size={16} className="animate-spin" />
                                Rate Limited by SmartThings
                            </div>
                            <div className="text-xs mb-3">
                                SmartThings allows 10 requests per 10 seconds.
                                <br />
                                Retrying automatically in <span className="font-bold text-lg">{retryIn}</span> seconds...
                            </div>
                            <div className="bg-yellow-700/30 rounded-full h-3 overflow-hidden">
                                <div
                                    className="bg-yellow-400 h-3 transition-all duration-1000 ease-linear"
                                    style={{ width: `${Math.max(0, 100 - (retryIn / 30 * 100))}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        error
                    )}
                </div>
                {!rateLimited && (
                    <>
                        <button
                            onClick={loadDevices}
                            className={`flex items-center justify-center gap-2 bg-${theme}-700 hover:bg-${theme}-600 text-white px-4 py-2 rounded transition-all font-mono text-sm`}
                        >
                            <RefreshCw size={16} />
                            Retry
                        </button>
                        <div className={`mt-4 text-xs text-${theme}-700`}>
                            <p className="mb-2">To connect SmartThings:</p>
                            <ol className="list-decimal list-inside space-y-1">
                                <li>Generate token at account.smartthings.com/tokens</li>
                                <li>Add SMARTTHINGS_TOKEN to backend/.env</li>
                                <li>Restart backend server</li>
                            </ol>
                        </div>
                    </>
                )}
            </div>
        );
    }

    if (!frameTV?.length && !audioSystem && otherDevices.length === 0) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col`}>
                <div className="flex items-center gap-2 mb-4">
                    <Home className={textClass} size={20} />
                    <h3 className="text-lg font-semibold">SMARTTHINGS</h3>
                </div>
                <div className="text-center py-8">
                    <div className={`text-sm text-${theme}-600 mb-4`}>
                        No SmartThings devices found
                    </div>
                    <button
                        onClick={loadDevices}
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
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col max-h-80 overflow-hidden`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Home className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>SMARTTHINGS</h3>
                </div>
                <button
                    onClick={loadDevices}
                    disabled={rateLimited || sending}
                    className={`text-${theme}-500 hover:text-${theme}-400 transition-colors ${rateLimited || sending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={rateLimited ? `Rate limited. Retry in ${retryIn}s` : 'Refresh devices'}
                >
                    <RefreshCw size={16} className={rateLimited ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {/* ALL FRAME TVS - Each gets full controls */}
                {frameTV && frameTV.map((tv) => (
                    <div key={tv.deviceId} className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
                        <button
                            onClick={() => setExpandedDevices(prev => ({ ...prev, [tv.deviceId]: !prev[tv.deviceId] }))}
                            className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}
                        >
                            <div className="flex items-center gap-2">
                                <Tv size={16} className={textClass} />
                                <span className={`text-sm font-semibold text-${theme}-400`}>{tv.label}</span>
                                {tv.switch?.switch?.value === 'on' && (
                                    <span className="text-xs bg-green-600/30 text-green-400 px-2 py-0.5 rounded">ON</span>
                                )}
                            </div>
                            {expandedDevices[tv.deviceId] ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
                        </button>
                        {expandedDevices[tv.deviceId] && (
                            <div className="p-3 pt-0 space-y-3">
                                {/* Power warning */}
                                {tv.switch?.switch?.value === 'off' && (
                                    <div className="bg-yellow-900/30 border border-yellow-700 rounded p-2 text-xs text-yellow-400">
                                        ⚠️ TV is OFF. Samsung TVs cannot be powered on via API - use remote or TV button.
                                    </div>
                                )}

                                {/* Power & Home Row */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => toggleTVPower(tv)}
                                        disabled={sending}
                                        className={`flex items-center justify-center gap-2 ${tv.switch?.switch?.value === 'on'
                                            ? 'bg-green-600 hover:bg-green-700'
                                            : 'bg-red-600 hover:bg-red-700'
                                            } text-white px-3 py-2 rounded transition-all text-sm ${sending ? 'opacity-50' : ''}`}
                                    >
                                        <Power size={14} />
                                        {tv.switch?.switch?.value === 'on' ? 'ON' : 'OFF'}
                                    </button>
                                    <button
                                        onClick={() => goToHome(tv)}
                                        disabled={sending}
                                        className={`flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-all text-sm ${sending ? 'opacity-50' : ''}`}
                                    >
                                        <Home size={14} />
                                        Home
                                    </button>
                                </div>

                                {/* Art Mode Row */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => enableArtMode(tv)}
                                        disabled={sending}
                                        className={`flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded transition-all text-sm ${sending ? 'opacity-50' : ''}`}
                                    >
                                        <Palette size={14} />
                                        Art ON
                                    </button>
                                    <button
                                        onClick={() => disableArtMode(tv)}
                                        disabled={sending}
                                        className={`flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded transition-all text-sm ${sending ? 'opacity-50' : ''}`}
                                    >
                                        <Tv size={14} />
                                        Art OFF
                                    </button>
                                </div>

                                {/* Volume Control */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-xs text-${theme}-600`}>Volume</span>
                                        <button
                                            onClick={() => toggleTVMute(tv)}
                                            disabled={sending}
                                            className={`text-${theme}-400 hover:text-${theme}-300`}
                                        >
                                            {tv.audioMute?.mute?.value === 'muted' ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                        </button>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        defaultValue={tv.audioVolume?.volume?.value || 50}
                                        onMouseUp={(e) => setTVVolume(tv, e.target.value)}
                                        onTouchEnd={(e) => setTVVolume(tv, e.target.value)}
                                        className="w-full"
                                    />
                                </div>

                                {/* Input Selection */}
                                <div>
                                    <div className={`text-xs text-${theme}-600 mb-2`}>Input Source</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {['HDMI1', 'HDMI2', 'HDMI3', 'HDMI4'].map(input => (
                                            <button
                                                key={input}
                                                onClick={() => changeInput(tv, input)}
                                                disabled={sending}
                                                className={`bg-${theme}-700 hover:bg-${theme}-600 text-white px-2 py-1.5 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                            >
                                                {input}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Playback Controls */}
                                <div>
                                    <div className={`text-xs text-${theme}-600 mb-2`}>Playback</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <button
                                            onClick={() => rewindMedia(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center bg-${theme}-800 hover:bg-${theme}-700 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                            title="Rewind"
                                        >
                                            <Rewind size={16} />
                                        </button>
                                        <button
                                            onClick={() => playMedia(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center bg-green-700 hover:bg-green-600 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                            title="Play"
                                        >
                                            <Play size={16} />
                                        </button>
                                        <button
                                            onClick={() => pauseMedia(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center bg-yellow-700 hover:bg-yellow-600 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                            title="Pause"
                                        >
                                            <Pause size={16} />
                                        </button>
                                        <button
                                            onClick={() => fastForwardMedia(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center bg-${theme}-800 hover:bg-${theme}-700 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                            title="Fast Forward"
                                        >
                                            <FastForward size={16} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <button
                                            onClick={() => previousTrack(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center gap-1 bg-${theme}-800 hover:bg-${theme}-700 text-white px-2 py-1.5 rounded transition-all text-xs ${sending ? 'opacity-50' : ''}`}
                                        >
                                            <SkipBack size={14} />
                                            Previous
                                        </button>
                                        <button
                                            onClick={() => nextTrack(tv)}
                                            disabled={sending}
                                            className={`flex items-center justify-center gap-1 bg-${theme}-800 hover:bg-${theme}-700 text-white px-2 py-1.5 rounded transition-all text-xs ${sending ? 'opacity-50' : ''}`}
                                        >
                                            Next
                                            <SkipForward size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {/* AUDIO SYSTEM SECTION */}
                {audioSystem && (
                    <div className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
                        <button
                            onClick={() => setShowAudio(!showAudio)}
                            className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}
                        >
                            <div className="flex items-center gap-2">
                                <Speaker size={16} className={textClass} />
                                <span className={`text-sm font-semibold text-${theme}-400`}>Audio System</span>
                            </div>
                            {showAudio ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
                        </button>
                        {showAudio && (
                            <div className="p-3 pt-0 space-y-3">
                                <div className={`bg-black/50 border ${borderClass} rounded p-2`}>
                                    <div className={`text-xs text-${theme}-700 mb-1`}>
                                        {audioSystem.label}
                                    </div>
                                </div>

                                <button
                                    onClick={toggleAudioPower}
                                    disabled={sending}
                                    className={`w-full flex items-center justify-center gap-2 ${audioSystem.switch?.switch?.value === 'on'
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                        } text-white px-3 py-2 rounded transition-all text-sm ${sending ? 'opacity-50' : ''}`}
                                >
                                    <Power size={14} />
                                    {audioSystem.switch?.switch?.value === 'on' ? 'ON' : 'OFF'}
                                </button>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className={`text-xs text-${theme}-600`}>Volume</span>
                                        <button
                                            onClick={toggleAudioMute}
                                            className={`text-${theme}-400 hover:text-${theme}-300`}
                                        >
                                            {audioSystem.audioMute?.mute?.value === 'muted' ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                        </button>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        defaultValue={audioSystem.audioVolume?.volume?.value || 50}
                                        onMouseUp={(e) => setAudioVolume(e.target.value)}
                                        onTouchEnd={(e) => setAudioVolume(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* OTHER DEVICES SECTION */}
                {otherDevices.length > 0 && (
                    <div className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}>
                        <button
                            onClick={() => setShowOther(!showOther)}
                            className={`w-full flex items-center justify-between p-3 hover:bg-${theme}-900/20 transition-colors`}
                        >
                            <div className="flex items-center gap-2">
                                <Monitor size={16} className={textClass} />
                                <span className={`text-sm font-semibold text-${theme}-400`}>Other Devices ({otherDevices.length})</span>
                            </div>
                            {showOther ? <ChevronUp size={16} className={textClass} /> : <ChevronDown size={16} className={textClass} />}
                        </button>
                        {showOther && (
                            <div className="p-3 pt-0 space-y-2">
                                {otherDevices.map(device => {
                                    const hasSwitch = device.components?.[0]?.capabilities?.some(c => c.id === 'switch');
                                    const isTV = device.components?.[0]?.capabilities?.some(c => c.id === 'audioVolume' || c.id === 'mediaInputSource');
                                    const isExpanded = expandedDevices[device.deviceId];

                                    return (
                                        <div
                                            key={device.deviceId}
                                            className={`bg-black/50 border ${borderClass} rounded overflow-hidden`}
                                        >
                                            <div className="p-3 flex items-center justify-between">
                                                <div className="flex flex-col gap-1 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        {getDeviceIcon(device)}
                                                        <span className={`text-sm text-${theme}-300 font-semibold`}>{device.label}</span>
                                                    </div>
                                                    <div className={`text-xs text-${theme}-700`}>
                                                        {isTV ? 'TV Controls Available' : 'Sensor'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasSwitch && (
                                                        <button
                                                            onClick={() => toggleDevice(device)}
                                                            disabled={sending}
                                                            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all bg-blue-600 hover:bg-blue-700 text-white ${sending ? 'opacity-50' : ''}`}
                                                        >
                                                            TOGGLE
                                                        </button>
                                                    )}
                                                    {isTV && (
                                                        <button
                                                            onClick={() => setExpandedDevices(prev => ({ ...prev, [device.deviceId]: !prev[device.deviceId] }))}
                                                            className={`text-${theme}-400 hover:text-${theme}-300 p-1`}
                                                        >
                                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {isTV && isExpanded && (
                                                <div className="px-3 pb-3 space-y-3 border-t border-gray-700 pt-3">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className={`text-xs text-${theme}-600`}>Volume</span>
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'audioMute', 'mute')}
                                                                disabled={sending}
                                                                className={`text-${theme}-400 hover:text-${theme}-300`}
                                                            >
                                                                <Volume2 size={14} />
                                                            </button>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            defaultValue="50"
                                                            onMouseUp={(e) => sendCommand(device.deviceId, 'audioVolume', 'setVolume', [parseInt(e.target.value)])}
                                                            onTouchEnd={(e) => sendCommand(device.deviceId, 'audioVolume', 'setVolume', [parseInt(e.target.value)])}
                                                            className="w-full"
                                                        />
                                                    </div>

                                                    <div>
                                                        <div className={`text-xs text-${theme}-600 mb-2`}>Input Source</div>
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            {['HDMI1', 'HDMI2', 'HDMI3', 'HDMI4'].map(input => (
                                                                <button
                                                                    key={input}
                                                                    onClick={() => sendCommand(device.deviceId, 'samsungvd.mediaInputSource', 'setInputSource', [input])}
                                                                    disabled={sending}
                                                                    className={`bg-${theme}-700 hover:bg-${theme}-600 text-white px-2 py-1.5 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                                                >
                                                                    {input}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Playback Controls */}
                                                    <div>
                                                        <div className={`text-xs text-${theme}-600 mb-2`}>Playback</div>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaPlayback', 'rewind')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center bg-${theme}-800 hover:bg-${theme}-700 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                                                title="Rewind"
                                                            >
                                                                <Rewind size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaPlayback', 'play')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center bg-green-700 hover:bg-green-600 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                                                title="Play"
                                                            >
                                                                <Play size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaPlayback', 'pause')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center bg-yellow-700 hover:bg-yellow-600 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                                                title="Pause"
                                                            >
                                                                <Pause size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaPlayback', 'fastForward')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center bg-${theme}-800 hover:bg-${theme}-700 text-white p-2 rounded transition-all ${sending ? 'opacity-50' : ''}`}
                                                                title="Fast Forward"
                                                            >
                                                                <FastForward size={16} />
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaTrackControl', 'previousTrack')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center gap-1 bg-${theme}-800 hover:bg-${theme}-700 text-white px-2 py-1.5 rounded transition-all text-xs ${sending ? 'opacity-50' : ''}`}
                                                            >
                                                                <SkipBack size={14} />
                                                                Previous
                                                            </button>
                                                            <button
                                                                onClick={() => sendCommand(device.deviceId, 'mediaTrackControl', 'nextTrack')}
                                                                disabled={sending}
                                                                className={`flex items-center justify-center gap-1 bg-${theme}-800 hover:bg-${theme}-700 text-white px-2 py-1.5 rounded transition-all text-xs ${sending ? 'opacity-50' : ''}`}
                                                            >
                                                                Next
                                                                <SkipForward size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmartThingsWidget;