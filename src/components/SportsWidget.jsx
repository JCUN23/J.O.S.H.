import { BACKEND_URL } from '../config';
import { useEffect, useState, useRef, useCallback } from "react";
import { TrendingUp, Clock, Loader2, Flame, Trophy, Tv, ExternalLink, Lightbulb, Zap } from "lucide-react";
import {
    getLionsGames,
    getMichiganGames,
    getMichiganBasketballGames,
    getPistonGames,
    getBarcelonaGames,
} from "../utils/sportsApi";

/* ---------- Team Colors ---------- */
const TEAM_COLORS = {
    "Detroit Lions": {
        primary: { r: 0, g: 118, b: 182 },
        secondary: { r: 176, g: 183, b: 188 },
        name: "Honolulu Blue & Silver"
    },
    "Michigan Football": {
        primary: { r: 255, g: 203, b: 5 },
        secondary: { r: 0, g: 39, b: 76 },
        name: "Maize & Blue"
    },
    "Michigan Basketball": {
        primary: { r: 255, g: 203, b: 5 },
        secondary: { r: 0, g: 39, b: 76 },
        name: "Maize & Blue"
    },
    "Detroit Pistons": {
        primary: { r: 200, g: 16, b: 46 },
        secondary: { r: 29, g: 66, b: 186 },
        name: "Red & Blue"
    },
    "FC Barcelona": {
        primary: { r: 165, g: 0, b: 68 },
        secondary: { r: 0, g: 77, b: 152 },
        name: "Blaugrana"
    },
};

/* ---------- Normalizer (defensive) ---------- */
const normalizeTeam = (data) => {
    if (!data) return null;

    return {
        team: data.team,
        record: data.record || null,
        streak: data.streak || null,
        playoffStatus: data.playoffStatus || null,
        lastGame: data.lastGame || null,
        nextGame: data.nextGame || null,
        espnLink: data.espnLink || null,
        isLive: data.isLive || false,
    };
};

const SportsWidget = ({ theme }) => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lightsSynced, setLightsSynced] = useState(false);
    const [syncedTeam, setSyncedTeam] = useState(null);
    const [gameDayActive, setGameDayActive] = useState(false);
    const scrollRef = useRef(null);


    /* ---------- Lights / Game Day: one shared engine on the server ---------- */
    // The backend (lib/gameDay) also fires Game Day automatically, once per live
    // game, with no browser open. These buttons are the manual versions.
    const callGameDay = useCallback(async (teamName, { lightsOnly = false } = {}) => {
        const res = await fetch(`${BACKEND_URL}/api/game-day`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: teamName, lightsOnly })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        console.log('🏟️ Game Day:', data.message);
        return data;
    }, []);

    const setTeamColors = useCallback(async (teamName) => {
        try {
            await callGameDay(teamName, { lightsOnly: true });
            setLightsSynced(true);
            setSyncedTeam(teamName);
            setTimeout(() => { setLightsSynced(false); setSyncedTeam(null); }, 5000);
        } catch (error) {
            console.error('Failed to sync lights:', error);
        }
    }, [callGameDay]);

    const activateGameDay = useCallback(async (teamName) => {
        setGameDayActive(true);
        try {
            await callGameDay(teamName);
        } catch (err) {
            console.error('Game Day Mode failed:', err);
        }
        setTimeout(() => setGameDayActive(false), 5000);
    }, [callGameDay]);

    useEffect(() => {
        const fetchSports = async () => {
            setLoading(true);

            const results = await Promise.all([
                getLionsGames(),
                getMichiganGames(),
                getMichiganBasketballGames(),
                getPistonGames(),
                getBarcelonaGames(),
            ]);

            const normalizedTeams = results.map(normalizeTeam).filter(Boolean);
            setTeams(normalizedTeams);

            // Auto Game Day now runs on the server (once per game, no browser needed).
            setLoading(false);
        };

        fetchSports();
        // Refresh more frequently to catch live games
        const interval = setInterval(fetchSports, 60 * 1000); // Every minute
        return () => clearInterval(interval);
    }, []);

    /* ---------- Auto-scroll ---------- */
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || loading) return;

        let dir = 1;
        let paused = false;
        let userInteracting = false;
        let userScrollTimeout;

        const tick = () => {
            if (paused || userInteracting) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) dir = -1;
            if (el.scrollTop <= 0) dir = 1;
            el.scrollTop += dir * 0.5;
        };

        const handleMouseEnter = () => { paused = true; };
        const handleMouseLeave = () => { paused = false; };

        // Only detect actual user scroll input (wheel, touch), not programmatic scrolls
        const handleUserScroll = () => {
            userInteracting = true;
            clearTimeout(userScrollTimeout);
            userScrollTimeout = setTimeout(() => {
                userInteracting = false;
            }, 2000); // Resume auto-scroll 2 seconds after user stops
        };

        const id = setInterval(tick, 30);
        el.addEventListener("mouseenter", handleMouseEnter);
        el.addEventListener("mouseleave", handleMouseLeave);
        el.addEventListener("wheel", handleUserScroll, { passive: true });
        el.addEventListener("touchstart", handleUserScroll, { passive: true });

        return () => {
            clearInterval(id);
            clearTimeout(userScrollTimeout);
            el.removeEventListener("mouseenter", handleMouseEnter);
            el.removeEventListener("mouseleave", handleMouseLeave);
            el.removeEventListener("wheel", handleUserScroll);
            el.removeEventListener("touchstart", handleUserScroll);
        };
    }, [loading, teams]);

    /* ---------- Theme helpers ---------- */
    const border = `border-${theme}-800`;
    const accent = `text-${theme}-400`;
    const title = `text-${theme}-300`;
    const sub = `text-${theme}-600`;
    const bgClass = `bg-${theme}-950/30`;

    const playoffColor = (status) => {
        if (status === "clinched") return "text-green-400";
        if (status === "eliminated") return "text-red-400";
        return accent;
    };

    // Find live games
    const liveTeams = teams.filter(t => t.isLive);

    // Streaming service links
    const streamingServices = [
        { name: "ESPN+", url: "https://plus.espn.com", color: "bg-red-600 hover:bg-red-700" },
        { name: "Fubo", url: "https://www.fubo.tv/welcome/channels", color: "bg-blue-600 hover:bg-blue-700" },
        { name: "Prime", url: "https://www.amazon.com/Amazon-Video/b?node=2858778011", color: "bg-sky-600 hover:bg-sky-700" },
        { name: "Peacock", url: "https://www.peacocktv.com/sports", color: "bg-purple-600 hover:bg-purple-700" },
    ];

    return (
        <div className={`col-span-8 md:col-span-4 ${bgClass} border ${border} rounded-lg p-3 max-h-80 overflow-hidden`}>
            <div className="flex items-center gap-2 mb-4">
                <TrendingUp className={accent} size={20} />
                <h3 className={`text-lg font-semibold text-${theme}-400`}>SPORTS</h3>
                {lightsSynced && syncedTeam && (
                    <div className="ml-auto flex items-center gap-1 text-xs bg-purple-600/30 border border-purple-500 rounded px-2 py-1 animate-pulse">
                        <Zap size={12} className="text-purple-400" />
                        <span className="text-purple-300">{syncedTeam.split(' ')[0]} Colors</span>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-24">
                    <Loader2 className={`animate-spin ${accent}`} size={32} />
                </div>
            ) : (
                <>
                    {/* LIVE GAME ALERT */}
                    {liveTeams.length > 0 && (
                        <div className="mb-4 space-y-2">
                            {liveTeams.map((team, idx) => {
                                const teamColor = TEAM_COLORS[team.team];
                                return (
                                    <div
                                        key={idx}
                                        className="bg-gradient-to-r from-red-900/50 to-red-800/30 border-2 border-red-500 rounded-lg p-4 animate-pulse shadow-[0_0_30px_rgba(255,0,0,0.4)]"
                                    >
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                            <span className="text-red-400 font-bold text-sm">LIVE NOW</span>
                                            <Tv size={16} className="text-red-400" />
                                            {teamColor && (
                                                <div className="ml-auto flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); activateGameDay(team.team); }}
                                                        disabled={gameDayActive}
                                                        className={`flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-xs transition-all ${gameDayActive ? 'opacity-50' : ''}`}
                                                        title="Wake TV + sync lights"
                                                    >
                                                        <Tv size={12} />
                                                        Game Day
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setTeamColors(team.team); }}
                                                        className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs transition-all"
                                                        title={`Set lights to ${teamColor.name}`}
                                                    >
                                                        <Lightbulb size={12} />
                                                        Lights
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mb-3">
                                            <div className="text-white font-bold text-lg mb-1 flex items-center gap-2">
                                                {team.team}
                                                {teamColor && (
                                                    <div className="flex gap-1">
                                                        <div
                                                            className="w-4 h-4 rounded-full border-2 border-white/50"
                                                            style={{ backgroundColor: `rgb(${teamColor.primary.r}, ${teamColor.primary.g}, ${teamColor.primary.b})` }}
                                                        />
                                                        <div
                                                            className="w-4 h-4 rounded-full border-2 border-white/50"
                                                            style={{ backgroundColor: `rgb(${teamColor.secondary.r}, ${teamColor.secondary.g}, ${teamColor.secondary.b})` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-gray-300">{team.lastGame?.opponent}</div>
                                            {team.lastGame?.score && (
                                                <div className="text-2xl font-bold text-white mt-2">
                                                    {team.lastGame.score}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs text-gray-400 mb-2">Watch on:</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {streamingServices.map(service => (
                                                    <a
                                                        key={service.name}
                                                        href={service.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className={`${service.color} text-white px-3 py-2 rounded text-sm font-semibold flex items-center justify-center gap-1 transition-all`}
                                                    >
                                                        {service.name}
                                                        <ExternalLink size={12} />
                                                    </a>
                                                ))}
                                            </div>
                                            <a
                                                href={team.espnLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-center bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded text-xs transition-all"
                                            >
                                                View on ESPN →
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* REGULAR TEAMS LIST */}
                    <div ref={scrollRef} className="space-y-3 max-h-56 overflow-y-auto pr-2">
                        {teams.map((t, idx) => {
                            const showBoth = t.lastGame && t.nextGame;
                            const teamColor = TEAM_COLORS[t.team];

                            return (
                                <div
                                    key={idx}
                                    className={`bg-black/60 border cursor-pointer ${border} rounded p-3 space-y-2 ${t.isLive ? "border-red-500 shadow-[0_0_15px_rgba(255,0,0,0.3)]" : ""}`}
                                    onClick={() => window.open(t.espnLink, "_blank")}
                                >
                                    {/* TEAM HEADER */}
                                    <div className="flex justify-between items-center">
                                        <div className={`font-semibold ${title} flex items-center gap-2`}>
                                            {t.isLive && (
                                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                            )}
                                            {t.team}
                                            {teamColor && (
                                                <div className="flex gap-1">
                                                    <div
                                                        className="w-3 h-3 rounded-full border border-white/30"
                                                        style={{ backgroundColor: `rgb(${teamColor.primary.r}, ${teamColor.primary.g}, ${teamColor.primary.b})` }}
                                                    />
                                                    <div
                                                        className="w-3 h-3 rounded-full border border-white/30"
                                                        style={{ backgroundColor: `rgb(${teamColor.secondary.r}, ${teamColor.secondary.g}, ${teamColor.secondary.b})` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        {t.record && (
                                            <div className={`text-xs ${sub}`}>
                                                {t.record}
                                            </div>
                                        )}
                                    </div>

                                    {/* META ROW */}
                                    {(t.streak || t.playoffStatus) && (
                                        <div className="flex justify-between text-xs">
                                            {t.streak && (
                                                <div className={`flex items-center gap-1 ${accent}`}>
                                                    <Flame size={12} />
                                                    {t.streak}
                                                </div>
                                            )}
                                            {t.playoffStatus && (
                                                <div className={`flex items-center gap-1 ${playoffColor(t.playoffStatus)}`}>
                                                    <Trophy size={12} />
                                                    {t.playoffStatus.toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* LAST + NEXT STACK */}
                                    {showBoth && (
                                        <>
                                            <div className="flex justify-between text-sm">
                                                <div>
                                                    <div className={sub}>Last</div>
                                                    <div>{t.lastGame.opponent}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div
                                                        className={`font-bold ${t.lastGame.result === "win"
                                                            ? "text-green-400"
                                                            : "text-red-400"
                                                            }`}
                                                    >
                                                        {t.lastGame.score}
                                                    </div>
                                                    <div className={sub}>Final</div>
                                                </div>
                                            </div>

                                            <div className="flex justify-between text-sm">
                                                <div>
                                                    <div className={sub}>Next</div>
                                                    <div>{t.nextGame.opponent}</div>
                                                </div>
                                                <div className="text-right">
                                                    <Clock size={14} className="inline mr-1" />
                                                    <span className={accent}>{t.nextGame.time}</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* SINGLE GAME FALLBACK */}
                                    {!showBoth && t.lastGame && (
                                        <div className="flex justify-between text-sm">
                                            <div>
                                                <div className={sub}>Last</div>
                                                <div>{t.lastGame.opponent}</div>
                                            </div>
                                            <div
                                                className={`font-bold ${t.lastGame.result === "win"
                                                    ? "text-green-400"
                                                    : "text-red-400"
                                                    }`}
                                            >
                                                {t.lastGame.score}
                                            </div>
                                        </div>
                                    )}

                                    {!showBoth && t.nextGame && (
                                        <div className="flex justify-between text-sm">
                                            <div>
                                                <div className={sub}>Next</div>
                                                <div>{t.nextGame.opponent}</div>
                                            </div>
                                            <div className={accent}>
                                                <Clock size={14} className="inline mr-1" />
                                                {t.nextGame.time}
                                            </div>
                                        </div>
                                    )}

                                    {!t.lastGame && !t.nextGame && (
                                        <div className={`text-xs ${sub}`}>
                                            No recent or upcoming games
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default SportsWidget;