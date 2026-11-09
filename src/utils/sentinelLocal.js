import { BACKEND_URL } from '../config';
import { getAccessToken as getSpotifyToken } from '../components/Spotify/spotifyAuth';

// Every command goes to the backend (routes/sentinel.js). Its instant commands handle the
// everyday phrasings ("lights off", "pause", "next song") without the AI; everything else
// goes to Alfred's AI. One brain: the panel and the Pi mic behave the same.
// (The panel used to run its own shortcuts here, which drifted from the backend.)

export async function processCommand(input) {
    let res;
    try {
        res = await fetch(`${BACKEND_URL}/api/sentinel/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: input, spotifyToken: getSpotifyToken?.() || undefined }),
        });
    } catch {
        return { response: "I can't reach the Sentinel server right now.", musicPlaying: false };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.error('[Sentinel] request failed:', res.status, data.detail || data.error || '', data.model ? `(model: ${data.model})` : '');
        return { response: "My AI service isn't responding right now. Try again in a moment.", musicPlaying: false };
    }
    const tools = data.toolsExecuted || [];
    const musicPlaying = tools.some((t) => t.tool === 'play_music' || (t.tool === 'control_spotify' && ['play', 'more_like_this'].includes(t.args?.action)));
    // "Show me the calendar", "dark mode", "lock the screen": the panel carries these out
    const panelActions = tools.filter((t) => t.tool === 'control_panel').map((t) => t.args || {});
    return { response: data.response || 'Done.', musicPlaying, panelActions };
}

const randomResponse = (list) => list[Math.floor(Math.random() * list.length)];

// All lights (Govee + Hue) through the backend, which reports what actually happened.
// Quick Controls' buttons use this.
export async function allLights(on, okResponses) {
    try {
        const res = await fetch(`${BACKEND_URL}/api/lights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ on }),
        });
        const data = await res.json();
        if (data.ok) return { response: randomResponse(okResponses) };
        if (!data.failed?.length) return { response: "I couldn't reach any lights." };
        return { response: `Some lights didn't respond: ${data.failed.join('; ')}` };
    } catch {
        return { response: "I couldn't reach the lights." };
    }
}
