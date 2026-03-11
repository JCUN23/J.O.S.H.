import { useEffect, useState, useRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, X, Heart } from "lucide-react";
import {
    getAccessToken,
} from "./spotifyAuth";
import {
    getPlayback,
    play,
    pause,
    next,
    previous,
    setVolume,
    getQueue,
    seek,
    saveTrack,
    transferPlayback,
    getDevices,
} from "./spotifyApi";
function getAverageColor(imgUrl, cb) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = canvas.height = 1;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        cb(`rgba(${r},${g},${b},0.9)`);
    };
}

export default function SpotifyMiniPlayer({ onClose, compact = false, theme, onOpen, onLogin }) {
    const [playback, setPlayback] = useState(null);
    const [queue, setQueue] = useState(null);
    const [volume, setVolumeState] = useState(50);
    const [progressMs, setProgressMs] = useState(
        playback?.progress_ms ?? 0
    );
    // eslint-disable-next-line no-unused-vars
    const [audio, setAudio] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const hasExchanged = useRef(false);
    const track = playback?.item;
    const device = playback?.device;
    const [devices, setDevices] = useState([]);
    const albumImage = track?.album?.images?.[0]?.url;
    const [isSaved, setIsSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [token, setToken] = useState(() => getAccessToken());


    const [albumBg, setAlbumBg] = useState("rgba(8,47,73,0.9)");

    useEffect(() => {
        if (!albumImage) return;
        getAverageColor(albumImage, setAlbumBg);
    }, [albumImage]);

    useEffect(() => {
        if (playback?.progress_ms == null) return;

        const id = setTimeout(() => {
            setProgressMs(playback.progress_ms);
        }, 0);

        return () => clearTimeout(id);
    }, [playback?.progress_ms]);

    useEffect(() => {
        if (!token || !track?.id) return;

        fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${track.id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
            .then(r => r.json())
            .then(([saved]) => setIsSaved(Boolean(saved)))
            .catch(() => setIsSaved(false));
    }, [token, track?.id]);

    // setInterval(() => {
    //     const token = refreshSpotifyTokenIfNeeded();
    //     if (!token) {
    //     // Show "Connect Spotify" state
    //     onLogin();
    //     return;
    //     }
    // }, 60_000);

    useEffect(() => {
        if (!playback?.is_playing) return;

        const id = setInterval(() => {
            setProgressMs(p => p + 1000);
        }, 1000);

        return () => clearInterval(id);
    }, [playback?.is_playing]);



    /* Check for token changes (after OAuth callback handled by App.jsx) */
    useEffect(() => {
        // Check immediately in case token was just saved
        const checkToken = () => {
            const currentToken = getAccessToken();
            if (currentToken && currentToken !== token) {
                setToken(currentToken);
            }
        };

        // Check on mount and periodically
        checkToken();
        const interval = setInterval(checkToken, 1000);

        // Also listen for storage events (from other tabs or after OAuth)
        const handleStorage = (e) => {
            if (e.key === 'spotify_access_token') {
                checkToken();
            }
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handleStorage);
        };
    }, [token]);


    /* Poll playback and queue */
    useEffect(() => {
        if (!token) return;

        const poll = async () => {
            try {
                const freshToken = getAccessToken();
                if (!freshToken) {
                    // show "Connect to Spotify"
                    return;
                }

                localStorage.setItem("spotify_access_token", freshToken);

                const [playbackData, queueData] = await Promise.all([
                    getPlayback(freshToken),
                    getQueue(freshToken)
                ]);

                setPlayback(playbackData);
                setQueue(queueData);

                if (playbackData?.device?.volume_percent !== undefined) {
                    setVolumeState(playbackData.device.volume_percent);
                }
            } catch (error) {
                console.error("Polling error:", error);
            }
        };

        poll();
        const id = setInterval(poll, 1000); // Poll every second for smooth progress
        return () => clearInterval(id);
    }, [token]);

    useEffect(() => {
        if (!token) return;

        getDevices(token).then(d => {
            if (d?.devices) setDevices(d.devices);
        });
    }, [token]);

    // const trackId = playback?.item?.id;

    // useEffect(() => {
    //     if (!token) return;
    //     if (!trackId) return;

    //     const item = playback?.item;
    //     if (item?.type !== "track") return;

    //     let alive = true;

    //     console.log("🎧 Audio feature request", {
    //         trackId,
    //         type: playback?.item?.type,
    //         isLocal: playback?.item?.is_local,
    //         tokenPresent: Boolean(token)
    //     });


    //     getAudioFeatures(token, trackId)
    //         .then(data => {
    //             if (alive) setAudio(data);
    //         })
    //         .catch(() => {
    //             if (alive) setAudio(null);
    //         });

    //     return () => {
    //         alive = false;
    //     };
    // }, [playback?.item, token, trackId]);

    useEffect(() => {
        if (audio) console.log("Audio features:", audio);
    }, [audio]);

    const handleVolumeChange = async (e) => {
        const newVolume = parseInt(e.target.value);
        setVolumeState(newVolume);
        await setVolume(token, newVolume);
    };

    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // 🔐 NOT LOGGED IN STATE
    if (!token) {
        // ✅ COMPACT TILE (GRID)
        if (compact) {
            return (
                <div className={`border rounded-lg p-3 bg-black flex flex-col gap-2 items-center justify-center text-center text-${theme}-300 border-${theme}-800`}>
                    <button
                        onClick={onLogin}
                        className={`text-sm px-48 py-2 text-white rounded bg-${theme}-700 hover:bg-${theme}-400/30 transition`}
                    >
                        Connect
                    </button>
                </div>
            );
        }

        // ✅ FULL / MODAL VERSION
        return (
            <div className={`border rounded-lg p-6 bg-black text-center text-${theme}-300 border-${theme}-800}`}>
                <div className="text-lg font-bold mb-2">Spotify</div>
                <p className="text-sm opacity-70 mb-4">
                    Connect your Spotify account to enable playback
                </p>
                <button
                    onClick={onLogin}
                    className={`px-4 py-2 border border-${theme}-700 hover:bg-${theme}-900/30 rounded transition`}
                >
                    Connect to Spotify
                </button>
            </div>
        );
    }

    // 2️⃣ LOGGED IN, NO PLAYBACK YET
    if (!track) {
        return (
            <div
                onClick={onOpen}
                className={`cursor-pointer border border-${theme}-800 rounded-lg p-3 bg-black text-${theme}-300`}
            >
                <div className="text-xs opacity-70">
                    Open Spotify to start playing
                </div>
            </div>
        );
    }


    if (!playback) {

        return (
            <div className={`bg-gradient-to-br from-${theme}-950 to-${theme}-200 border border-${theme}-800 rounded-lg p-8 text-${theme}-400 font-mono`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className={`text-xl font-bold text-${theme}-300`}>SPOTIFY</h2>
                    {onClose && (
                        <button onClick={onClose} className={`text-${theme}-600 hover:text-${theme}-400`}>
                            <X size={20} />
                        </button>
                    )}
                </div>
                <p className={`text-${theme}-600 text-center py-8`}>No active playback. Start playing something on Spotify.</p>
            </div>
        );
    }

    const { item, is_playing, progress_ms } = playback;
    const progressPercent = (progress_ms / item?.duration_ms) * 100;

    // COMPACT VERSION for Quick Controls
    if (compact) {
        return (
            <div className="space-y-2 mt-4">
                <div className="flex items-center gap-2">
                    <img
                        src={item.album?.images[2]?.url || item.album?.images[0]?.url}
                        alt={item.album.name}
                        className={`w-12 h-12 rounded border border-${theme}-700`}
                    />
                    <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold text-${theme}-200 truncate`}>{item.name}</div>
                        <div className={`text-xs text-${theme}-600 truncate`}>
                            {item.artists.map(a => a.name).join(", ")}
                        </div>
                        <div className={`text-xs text-${theme}-700 mt-1 mb-1 truncate`}>{item.album.name}</div>
                    </div>
                </div>

                {/* Mini progress bar */}
                <div className={`h-1 bg-${theme}-900/50 rounded-full mb-2`}>
                    <div
                        className={`h-full bg-${theme}-500 rounded-full transition-all mb-2`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Compact controls */}
                <div className="flex items-center justify-center gap-3 pt-4">
                    <button
                        onClick={() => previous(token)}
                        className={`text-${theme}-400 hover:text-${theme}-300 transition-colors`}
                    >
                        <SkipBack size={16} />
                    </button>
                    <button
                        onClick={() => is_playing ? pause(token) : play(token)}
                        className={`bg-${theme}-600 hover:bg-${theme}-500 text-white rounded-full p-2 transition-all`}
                    >
                        {is_playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                    </button>
                    <button
                        onClick={() => next(token)}
                        className={`text-${theme}-400 hover:text-${theme}-300 transition-colors`}
                    >
                        <SkipForward size={16} />
                    </button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-3 mb-4 px-2">
                    <Volume2 size={20} className={`text-${theme}-500`} />
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={handleVolumeChange}
                        className={`flex-1 h-2 bg-${theme}-900/50 [&::-webkit-slider-thumb]:bg-${theme}-400"} rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer`}
                    />
                    <span className={`text-xs text-${theme}-600 w-8 text-right`}>{volume}%</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`border border-${theme}-800 rounded-lg p-6 text-${theme}-400 font-mono w-[600px] shadow-2xl min-h-[300px]`} style={{ backgroundImage: `linear-gradient(${albumBg}, black)` }}>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold text-${theme}-300`}>SPOTIFY</h2>
                {onClose && (
                    <button
                        onClick={onClose}
                        className={`text-${theme}-600 hover:text-${theme}-400 transition-colors`}
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Album Art and Track Info */}
            <div className="flex gap-4 mb-4">
                <img
                    src={item.album.images[0]?.url}
                    alt={item.album.name}
                    className={`w-32 h-32 rounded border-2 border-${theme}-700`}
                />
                <div className="flex-1 overflow-hidden">
                    <div className={`font-bold text-lg text-${theme}-200 truncate mb-2`}>{item.name}</div>
                    {track?.popularity !== undefined && (
                        <div className="mt-1">
                            <div className={`h-1 w-full bg-${theme}-900/40 rounded mb-1`}>
                                <div
                                    className={`h-1 bg-${theme}-400 rounded`}
                                    style={{ width: `${track.popularity}%` }}
                                />
                            </div>
                            <div className="text-[10px] opacity-60 mt-0.5 mb-2">
                                Popularity: {track.popularity}%
                            </div>
                        </div>
                    )}
                    <div className={`text-sm text-${theme}-500 truncate`}>
                        {item.artists.map(a => a.name).join(", ")}
                    </div>
                    <div className={`text-xs text-${theme}-700 mt-1 truncate`}>{item.album.name}</div>
                    <div className="flex gap-3 mt-2 text-xs opacity-70">
                        {track?.external_urls?.spotify && (
                            <a
                                href={track.external_urls.spotify}
                                target="_blank"
                                rel="noreferrer"
                                className="underline opacity-70 hover:opacity-100"
                            >
                                Open in Spotify
                            </a>
                        )}
                        {track?.album?.external_urls?.spotify && (
                            <a
                                href={track.album.external_urls.spotify}
                                target="_blank"
                                rel="noreferrer"
                                className="underline opacity-70 hover:opacity-100"
                            >
                                Album
                            </a>
                        )}

                        {track?.artists?.[0]?.external_urls?.spotify && (
                            <a
                                href={track.artists[0].external_urls.spotify}
                                target="_blank"
                                rel="noreferrer"
                                className="underline opacity-70 hover:opacity-100"
                            >
                                Artist
                            </a>
                        )}
                    </div>

                </div>
            </div>

            {/* PROGRESS */}
            <div className="mt-4">
                <div className={`relative h-2 rounded overflow-hidden bg-${theme}-900/40"}`}>
                    <div
                        className={`absolute left-0 top-0 min-h-[300px] bg-${theme}-400 transition-[width] duration-1000 ease-linear`}
                        style={{
                            width: `${Math.min(
                                (progressMs / track.duration_ms) * 100,
                                100
                            )}%`
                        }}
                    />
                </div>

                {/* Invisible range input on top */}
                <input
                    type="range"
                    min={0}
                    max={track.duration_ms}
                    value={progressMs}
                    onChange={seek}
                    className="w-full -mt-2 opacity-0 cursor-pointer"
                />

                <div className="flex justify-between text-xs opacity-70 mt-1">
                    <span>{formatTime(progressMs)}</span>
                    <span>{formatTime(track.duration_ms)}</span>
                </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4 mb-4">
                <button
                    onClick={() => previous(token)}
                    className={`text-${theme}-400 hover:text-${theme}-300 transition-colors`}
                >
                    <SkipBack size={24} />
                </button>
                <button
                    onClick={() => is_playing ? pause(token) : play(token)}
                    className={`bg-${theme}-600 hover:bg-${theme}-500 text-white rounded-full p-3 transition-all`}
                >
                    {is_playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
                </button>
                <button
                    onClick={() => next(token)}
                    className={`text-${theme}-400 hover:text-${theme}-300 transition-colors`}
                >
                    <SkipForward size={24} />
                </button>
            </div>
            <button
                disabled={saving}
                onClick={async () => {
                    if (!track?.id) return;

                    setSaving(true);
                    try {
                        await saveTrack(token, track.id);
                        setIsSaved(true);
                    } finally {
                        setSaving(false);
                    }
                }}
                className={`
    flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs mb-4
    transition-all
    ${isSaved ? "border-${theme}-400 bg-${theme}-400/10 text-${theme}-300" : "border-${theme}-800 text-${theme}-500 hover:border-${theme}-500 hover:text-${theme}-300"}
    ${saving ? "opacity-50 cursor-wait" : "cursor-pointer"}
  `}
            >
                <Heart
                    size={14}
                    className={isSaved ? "fill-current" : ""}
                />
                {isSaved ? "Saved" : "Like"}
            </button>
            {/* Volume Control */}
            <div className="flex items-center gap-3 mb-4 px-2">
                <Volume2 size={20} className={`text-${theme}-500`} />
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                    className={`flex-1 h-2 bg-${theme}-900/50 [&::-webkit-slider-thumb]:bg-${theme}-400 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer`}
                />
                <span className={`text-xs text-${theme}-600 w-8 text-right`}>{volume}%</span>
            </div>

            {audio && (
                <div className="mt-4 text-xs grid grid-cols-2 gap-2">
                    <div>Energy: {Math.round(audio.energy * 100)}</div>
                    <div>Dance: {Math.round(audio.danceability * 100)}</div>
                    <div>Valence: {Math.round(audio.valence * 100)}</div>
                    <div>BPM: {Math.round(audio.tempo)}</div>
                </div>
            )}  
            {/* Queue */}
            {queue?.queue && queue.queue.length > 0 && (
                <div className={`border-t border-${theme}-800"} pt-4 mb-4`}>
                    <div className={`text-sm font-semibold text-${theme}-500 mb-2`}>UP NEXT:</div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                        {queue.queue.slice(0, 3).map((track, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                                <img
                                    src={track.album.images[2]?.url}
                                    alt={track.album.name}
                                    className="w-8 h-8 rounded border border-cyan-800"
                                />
                                <div className="flex-1 overflow-hidden">
                                    <div className={`text-${theme}-300 truncate`}>{track.name}</div>
                                    <div className={`text-${theme}-700 truncate`}>
                                        {track.artists.map(a => a.name).join(", ")}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {playback?.device?.name && (
                <div className="text-xs opacity-60 mt-1">
                    Playing on <span className="font-medium">{device.name}</span>
                </div>
            )}

            {devices.length > 0 && (
                <select
                    className="w-full bg-black border mt-3"
                    onChange={e => transferPlayback(token, e.target.value)}
                >
                    {devices.map(d => (
                        <option key={d.id} value={d.id}>
                            {d.name} {d.is_active ? "✓" : ""}
                        </option>
                    ))}
                </select>
            )}

        </div>
    );
}