import React, { useState, useEffect, useMemo } from "react";
import {
    Cloud,
    Loader2,
    Sun,
    CloudSun,
    CloudRain,
    CloudSnow,
    CloudLightning,
    Wind,
    AlertTriangle,
} from "lucide-react";

/* ---------- Helpers ---------- */

function getWeatherCondition(code) {
    if (code === 0) return "Clear";
    if (code <= 3) return "Partly Cloudy";
    if (code <= 48) return "Foggy";
    if (code <= 67) return "Rainy";
    if (code <= 77) return "Snowy";
    if (code <= 82) return "Showers";
    if (code <= 86) return "Snow Showers";
    return "Stormy";
}

function getWeatherIcon(code, className) {
    if (code === 0) return <Sun className={className} />;
    if (code <= 3) return <CloudSun className={className} />;
    if (code <= 48) return <Cloud className={className} />;
    if (code <= 67) return <CloudRain className={className} />;
    if (code <= 77) return <CloudSnow className={className} />;
    if (code <= 82) return <CloudRain className={className} />;
    return <CloudLightning className={className} />;
}

function getBgTint(code, theme) {
    if (code === 0) return `from-${theme}-900/40`;
    if (code <= 3) return `from-${theme}-950/40`;
    if (code <= 67) return `from-${theme}-900/50`;
    if (code <= 77) return `from-${theme}-800/60`;
    return `from-${theme}-950/60`;
}

/* ---------- Component ---------- */

const WeatherWidget = ({ theme }) => {
    const [weather, setWeather] = useState(null);
    const [hourly, setHourly] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                setLoading(true);

                const lat = 42.751784;
                const lon = -83.0058174;

                const res = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America/Detroit`
                );

                const data = await res.json();

                setWeather({
                    temp: Math.round(data.current.temperature_2m),
                    feelsLike: Math.round(data.current.apparent_temperature),
                    humidity: data.current.relative_humidity_2m,
                    wind: Math.round(data.current.wind_speed_10m),
                    uv: data.current.uv_index,
                    code: data.current.weather_code,
                    condition: getWeatherCondition(data.current.weather_code),
                    high: Math.round(data.daily.temperature_2m_max[0]),
                    low: Math.round(data.daily.temperature_2m_min[0]),
                    sunrise: data.daily.sunrise[0],
                    sunset: data.daily.sunset[0],
                    location: "Washington, MI",
                });

                const nowIdx = data.hourly.time.findIndex(
                    t => new Date(t) > new Date()
                );

                setHourly(
                    data.hourly.time.slice(nowIdx, nowIdx + 6).map((t, i) => ({
                        time: new Date(t).toLocaleTimeString([], {
                            hour: "numeric",
                        }),
                        temp: Math.round(data.hourly.temperature_2m[nowIdx + i]),
                        code: data.hourly.weather_code[nowIdx + i],
                    }))
                );

                setLoading(false);
            } catch (err) {
                console.error("Weather error:", err);
                setLoading(false);
            }
        };

        fetchWeather();
        const id = setInterval(fetchWeather, 10 * 60 * 1000);
        return () => clearInterval(id);
    }, []);

    const isSevere = weather?.code >= 95 || weather?.wind >= 30;

    const briefing = useMemo(() => {
        if (!weather) return "";
        return `Currently ${weather.temp} degrees and ${weather.condition.toLowerCase()}. High of ${weather.high}, low of ${weather.low}.`;
    }, [weather]);

    const border = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;

    return (
        <div
            className={` bg-gradient-to-b ${getBgTint(weather?.code ?? 0, theme)} ${bgClass} border ${border} rounded-lg p-4 text-${theme}-300`}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Cloud className={`text-${theme}-400`} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>WEATHER</h3>
                </div>
                {weather && getWeatherIcon(
                    weather.code,
                    `text-${theme}-400 w-6 h-6`
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-10">
                    <Loader2 className={`animate-spin opacity-60 text-${theme}-400`} size={32} />
                </div>
            ) : weather && (
                <>
                    {/* Severe alert */}
                    {isSevere && (
                        <div className="flex items-center gap-2 mb-3 text-xs bg-red-900/40 border border-red-700 rounded px-2 py-1">
                            <AlertTriangle size={14} />
                            Severe weather conditions detected
                        </div>
                    )}

                    {/* Main */}
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <div className="text-5xl font-bold">{weather.temp}°</div>
                            <div className="text-xs opacity-70">
                                Feels like {weather.feelsLike}°
                            </div>
                        </div>
                        <div className="text-right text-sm opacity-70">
                            <div>{weather.condition}</div>
                            <div>{weather.location}</div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>💧 Humidity: {weather.humidity}%</div>
                        <div className="flex items-center gap-1">
                            <Wind size={12} /> {weather.wind} mph
                        </div>
                        <div>☀️ UV Index: {weather.uv}</div>
                        <div>⬆ {weather.high}° / ⬇ {weather.low}°</div>
                    </div>

                    {/* Hourly strip */}
                    <div className="flex justify-between text-xs mb-3">
                        {hourly.map((h, i) => (
                            <div key={i} className="flex flex-col items-center gap-1">
                                <span className="opacity-70">{h.time}</span>
                                {getWeatherIcon(
                                    h.code,
                                    `text-${theme}-400 w-4 h-4`
                                )}
                                <span>{h.temp}°</span>
                            </div>
                        ))}
                    </div>

                    {/* Briefing */}
                    <div className="text-[11px] opacity-60 italic">
                        🧠 Briefing: {briefing}
                    </div>
                </>
            )}
        </div>
    );
};

export default WeatherWidget;
