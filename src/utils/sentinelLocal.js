/**
 * Sentinel Local - Device control and Groq AI integration
 * Only handles device controls locally, everything else goes to Groq
 */

import { getAccessToken as getSpotifyToken } from '../components/Spotify/spotifyAuth';

const BACKEND_URL = 'http://127.0.0.1:3001';
const SPOTIFY_BASE = 'https://api.spotify.com/v1';

// Color name to RGB mapping
const COLORS = {
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    cyan: { r: 0, g: 255, b: 255 },
    purple: { r: 128, g: 0, b: 128 },
    yellow: { r: 255, g: 255, b: 0 },
    orange: { r: 255, g: 165, b: 0 },
    pink: { r: 255, g: 192, b: 203 },
    white: { r: 255, g: 255, b: 255 },
    warm: { r: 255, g: 200, b: 150 },
    cool: { r: 200, g: 220, b: 255 }
};

// Personality responses for device controls
const RESPONSES = {
    lightsOn: ["Lights on.", "Illuminating.", "Done."],
    lightsOff: ["Lights off.", "Going dark.", "Done."],
    colorChange: (color) => [`${color.charAt(0).toUpperCase() + color.slice(1)}.`, "Done."],
    brightness: (level) => [`Brightness at ${level}%.`, "Done."],
};

function randomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

// Command patterns - ONLY device controls
const COMMANDS = [
    // Specific device ON
    {
        patterns: [
            /turn (on|up) (the )?(living room lamp|lamp|projector|galaxy|neon|rope|ring|lr left|lr right)/i
        ],
        handler: async (match) => {
            const deviceMap = {
                'living room lamp': 'Living Room Lamp',
                'lamp': 'Living Room Lamp',
                'projector': 'Galaxy',
                'galaxy': 'Galaxy',
                'neon': 'Neon Rope',
                'rope': 'Neon Rope',
                'ring': 'Ring',
                'lr left': 'LR Left',
                'lr right': 'LR Right'
            };
            const words = match[0].toLowerCase();
            let deviceName = null;
            for (const [key, value] of Object.entries(deviceMap)) {
                if (words.includes(key)) {
                    deviceName = value;
                    break;
                }
            }
            if (deviceName) {
                await controlGovee({ name: 'turn', value: 'on' }, deviceName);
                return { response: `${deviceName} is on.` };
            }
            return null;
        }
    },

    // Specific device OFF
    {
        patterns: [
            /turn (off|down) (the )?(living room lamp|lamp|projector|galaxy|neon|rope|ring|lr left|lr right)/i
        ],
        handler: async (match) => {
            const deviceMap = {
                'living room lamp': 'Living Room Lamp',
                'lamp': 'Living Room Lamp',
                'projector': 'Galaxy',
                'galaxy': 'Galaxy',
                'neon': 'Neon Rope',
                'rope': 'Neon Rope',
                'ring': 'Ring',
                'lr left': 'LR Left',
                'lr right': 'LR Right'
            };
            const words = match[0].toLowerCase();
            let deviceName = null;
            for (const [key, value] of Object.entries(deviceMap)) {
                if (words.includes(key)) {
                    deviceName = value;
                    break;
                }
            }
            if (deviceName) {
                await controlGovee({ name: 'turn', value: 'off' }, deviceName);
                return { response: `${deviceName} is off.` };
            }
            return null;
        }
    },

    // All Lights ON
    {
        patterns: [
            /turn (on|up) (the |all |all the )?(lights?)/i,
            /lights? on/i
        ],
        handler: async () => {
            await controlGovee({ name: 'turn', value: 'on' });
            return { response: randomResponse(RESPONSES.lightsOn) };
        }
    },

    // All Lights OFF
    {
        patterns: [
            /turn (off|down) (the |all |all the )?(lights?)/i,
            /lights? off/i
        ],
        handler: async () => {
            await controlGovee({ name: 'turn', value: 'off' });
            return { response: randomResponse(RESPONSES.lightsOff) };
        }
    },

    // Set color
    {
        patterns: [
            /set (the )?(lights?|lamp) (to )?(\w+)/i,
            /make (the )?(lights?|lamp) (\w+)/i,
            /change (the )?(lights?|lamp) (to )?(\w+)/i
        ],
        handler: async (match) => {
            const words = match[0].toLowerCase().split(/\s+/);
            let color = null;
            for (const word of words) {
                if (COLORS[word]) {
                    color = word;
                    break;
                }
            }

            if (color && COLORS[color]) {
                await controlGovee({ name: 'color', value: COLORS[color] });
                return { response: randomResponse(RESPONSES.colorChange(color)) };
            }
            return null;
        }
    },

    // Set brightness
    {
        patterns: [
            /(?:set )?brightness (to )?(\d+)/i,
            /(\d+)%? brightness/i,
            /dim (the )?(lights? )?(to )?(\d+)/i,
            /set (the )?(lights? )?(to )?(\d+)%/i
        ],
        handler: async (match) => {
            const numMatch = match[0].match(/(\d+)/);
            if (numMatch) {
                const level = Math.min(100, Math.max(0, parseInt(numMatch[1])));
                await controlGovee({ name: 'brightness', value: level });
                return { response: randomResponse(RESPONSES.brightness(level)) };
            }
            return null;
        }
    },

    // Spotify - Play/Resume
    {
        patterns: [
            /play (my )?(music|song|spotify|tunes)$/i,
            /resume (my )?(music|spotify|playback)/i,
            /start (the )?(music|spotify)/i
        ],
        handler: async () => {
            const result = await spotifyControl('play');
            return { response: result ? "Playing." : "Spotify isn't connected." };
        }
    },

    // Spotify - Pause
    {
        patterns: [
            /pause (music|spotify|the music)?/i,
            /stop (music|spotify|the music|playing)/i
        ],
        handler: async () => {
            const result = await spotifyControl('pause');
            return { response: result ? "Paused." : "Spotify isn't connected." };
        }
    },

    // Spotify - Next
    {
        patterns: [
            /next (song|track)/i,
            /skip (this )?(song|track)?/i
        ],
        handler: async () => {
            const result = await spotifyControl('next');
            return { response: result ? "Next track." : "Spotify isn't connected." };
        }
    },

    // Spotify - Previous
    {
        patterns: [
            /previous (song|track)/i,
            /go back/i,
            /last (song|track)/i
        ],
        handler: async () => {
            const result = await spotifyControl('previous');
            return { response: result ? "Going back." : "Spotify isn't connected." };
        }
    },

    // TV - Power
    {
        patterns: [
            /turn (on|off) (the )?tv/i,
            /tv (on|off)/i
        ],
        handler: async (match) => {
            const action = match[0].toLowerCase().includes('off') ? 'off' : 'on';
            const result = await controlTV('switch', action);
            return { response: result ? `TV ${action}.` : "Couldn't control the TV." };
        }
    },
];

// Govee control helper
async function controlGovee(cmd, deviceName = null) {
    try {
        const devicesResponse = await fetch(`${BACKEND_URL}/api/govee/devices`);
        const devicesData = await devicesResponse.json();

        if (!devicesData.data?.devices?.length) {
            throw new Error('No Govee devices found');
        }

        let devices = devicesData.data.devices;

        if (deviceName) {
            const lower = deviceName.toLowerCase();
            devices = devices.filter(d =>
                d.deviceName.toLowerCase().includes(lower)
            );
            if (devices.length === 0) {
                throw new Error(`No device found matching "${deviceName}"`);
            }
        }

        for (let i = 0; i < devices.length; i++) {
            const device = devices[i];
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1100));
            }

            await fetch(`${BACKEND_URL}/api/govee/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device: device.device,
                    model: device.model,
                    cmd: cmd
                })
            });
        }
    } catch (err) {
        console.error('Govee control error:', err);
        throw err;
    }
}

// SmartThings TV control helper
async function controlTV(capability, command, args = []) {
    try {
        const devicesRes = await fetch(`${BACKEND_URL}/api/smartthings/devices`);
        const devicesData = await devicesRes.json();

        if (!devicesData.items) {
            return false;
        }

        const tv = devicesData.items.find(d =>
            d.label?.toLowerCase().includes('frame') ||
            d.label?.toLowerCase().includes('tv')
        );

        if (!tv) {
            return false;
        }

        const response = await fetch(`${BACKEND_URL}/api/smartthings/devices/${tv.deviceId}/commands`, {
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

        return response.ok;
    } catch {
        return false;
    }
}

// Spotify helpers
async function spotifyControl(action, value = null) {
    const token = getSpotifyToken();
    if (!token) return false;

    try {
        let endpoint = '';
        let method = 'PUT';

        switch (action) {
            case 'play':
                endpoint = '/me/player/play';
                break;
            case 'pause':
                endpoint = '/me/player/pause';
                break;
            case 'next':
                endpoint = '/me/player/next';
                method = 'POST';
                break;
            case 'previous':
                endpoint = '/me/player/previous';
                method = 'POST';
                break;
            case 'volume':
                endpoint = `/me/player/volume?volume_percent=${value}`;
                break;
            default:
                return false;
        }

        await fetch(`${SPOTIFY_BASE}${endpoint}`, {
            method,
            headers: { Authorization: `Bearer ${token}` }
        });
        return true;
    } catch {
        return false;
    }
}

// Fall back to Groq AI for everything else
async function askGroq(input, getCalendarEvents) {
    try {
        console.log('[Sentinel] Asking Groq:', input);

        const response = await fetch(`${BACKEND_URL}/api/sentinel/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: input, spotifyToken: getSpotifyToken() })
        });

        if (!response.ok) {
            const data = await response.json();
            if (data.needsKey) {
                console.log('Groq API key not configured');
                return null;
            }
            return null;
        }

        const data = await response.json();
        console.log('[Sentinel] Groq response:', data);

        // Check if music was played (from backend toolsExecuted)
        const musicPlaying = (data.toolsExecuted || []).some(t => t.tool === 'play_music');

        // Execute any frontend tool calls (legacy format — old backend returned "tools")
        if (data.tools && data.tools.length > 0) {
            const toolOutputs = [];
            for (const toolCall of data.tools) {
                const result = await executeToolCall(toolCall.tool, toolCall.args, getCalendarEvents);
                if (typeof result === 'string') {
                    toolOutputs.push(result);
                }
            }

            if (toolOutputs.length > 0) {
                const text = data.response ? `${data.response} ${toolOutputs.join(' ')}` : toolOutputs.join(' ');
                return { response: text, musicPlaying };
            }
        }

        if (data.response && data.response.trim()) {
            return { response: data.response, musicPlaying };
        }

        return null;
    } catch (err) {
        console.error('Groq error:', err);
        return null;
    }
}

// Execute tool calls from Groq (same as before, but importing functions dynamically)
async function executeToolCall(tool, args) {
    console.log('[Sentinel] Executing tool:', tool, args);

    switch (tool) {
        case 'control_lights':
            if (args.action === 'on') {
                await controlGovee({ name: 'turn', value: 'on' }, args.device);
            } else if (args.action === 'off') {
                await controlGovee({ name: 'turn', value: 'off' }, args.device);
            } else if (args.action === 'color' && args.value) {
                const color = COLORS[args.value.toLowerCase()];
                if (color) await controlGovee({ name: 'color', value: color }, args.device);
            } else if (args.action === 'brightness' && args.value) {
                await controlGovee({ name: 'brightness', value: parseInt(args.value) }, args.device);
            }
            return true;

        case 'control_spotify':
            if (args.action === 'search_and_play' && args.value) {
                // Import searchAndPlaySpotify dynamically
                const token = getSpotifyToken();
                if (!token) return "Spotify isn't connected.";

                try {
                    const searchRes = await fetch(
                        `${SPOTIFY_BASE}/search?q=${encodeURIComponent(args.value)}&type=track&limit=1`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    if (searchRes.ok) {
                        const searchData = await searchRes.json();
                        const track = searchData.tracks?.items?.[0];

                        if (track) {
                            const playRes = await fetch(`${SPOTIFY_BASE}/me/player/play`, {
                                method: 'PUT',
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ uris: [track.uri] })
                            });

                            if (playRes.ok || playRes.status === 204) {
                                return `Playing ${track.name} by ${track.artists[0].name}.`;
                            }
                        }
                    }
                } catch {
                    // Ignore
                }
                return "Couldn't play that song.";
            } else if (args.action === 'volume' && args.value) {
                await spotifyControl('volume', parseInt(args.value));
            } else {
                await spotifyControl(args.action);
            }
            return true;

        case 'control_tv':
            if (args.action === 'on') await controlTV('switch', 'on');
            else if (args.action === 'off') await controlTV('switch', 'off');
            else if (args.action === 'art_mode_on') await controlTV('samsungvd.ambient', 'on');
            else if (args.action === 'art_mode_off') await controlTV('samsungvd.ambient', 'off');
            else if (args.action === 'mute') await controlTV('audioMute', 'mute');
            else if (args.action === 'volume' && args.value) await controlTV('audioVolume', 'setVolume', [parseInt(args.value)]);
            else if (args.action === 'hdmi' && args.value) await controlTV('samsungvd.mediaInputSource', 'setInputSource', [`HDMI${args.value}`]);
            return true;

        case 'get_time': {
            const now = new Date();
            return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
                   ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        }

        case 'get_weather': {
            const lat = 42.751784;
            const lon = -83.0058174;

            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/Detroit`
            );
            const data = await res.json();

            const temp = Math.round(data.current.temperature_2m);
            const feelsLike = Math.round(data.current.apparent_temperature);
            const high = Math.round(data.daily.temperature_2m_max[0]);
            const low = Math.round(data.daily.temperature_2m_min[0]);
            const code = data.current.weather_code;

            let condition = 'clear';
            if (code === 0) condition = 'clear';
            else if (code <= 3) condition = 'partly cloudy';
            else if (code <= 48) condition = 'foggy';
            else if (code <= 67) condition = 'rainy';
            else if (code <= 77) condition = 'snowy';
            else if (code <= 82) condition = 'rainy';
            else condition = 'stormy';

            return `Currently ${temp} degrees and ${condition}. Feels like ${feelsLike}. High of ${high}, low of ${low}.`;
        }

        case 'get_calendar': {
            // Calendar not available in this context
            return 'Calendar not connected.';
        }

        case 'get_sports': {
            // Sports queries go to Groq, it will search the web
            return null;
        }

        case 'get_news': {
            // News queries go to Groq, it will search the web
            return null;
        }

        default:
            return null;
    }
}

// Main processing function
export async function processCommand(input, getCalendarEvents = null) {
    const normalized = input.trim().toLowerCase();

    console.log('[Sentinel] Processing:', normalized);

    // First, try device control patterns (fast, local)
    for (const command of COMMANDS) {
        for (const pattern of command.patterns) {
            const match = normalized.match(pattern);
            if (match) {
                try {
                    const result = await command.handler(match, getCalendarEvents);
                    if (result) {
                        console.log('[Sentinel] Device control matched:', pattern);
                        return { response: result.response, musicPlaying: false };
                    }
                } catch (err) {
                    console.error('Device control error:', err);
                    return { response: "Something went wrong with that device.", musicPlaying: false };
                }
            }
        }
    }

    // No device control matched - ask Groq for everything else
    console.log('[Sentinel] No device control match, asking Groq...');
    const groqResult = await askGroq(input, getCalendarEvents);

    if (groqResult) {
        return groqResult; // { response, musicPlaying }
    }

    // Groq failed
    return { response: "I'm not sure how to help with that.", musicPlaying: false };
}
