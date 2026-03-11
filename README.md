# J.O.S.H. — Joint Operations & Systems Hub

A Batcave-themed smart home dashboard and AI assistant built with React + Node.js, designed to run 24/7 on a wall-mounted Raspberry Pi.

J.O.S.H. unifies smart lights, music, sports, weather, calendars, news, and more into a single voice-controlled command center — powered by **Sentinel**, a custom AI agent with the personality of Alfred Pennyworth.

## Features

### Sentinel AI Assistant
A voice-activated AI agent powered by Groq/Llama with real tool execution — not just chat responses. Sentinel can control your entire smart home through natural conversation.

- **Voice wake word** — Say "Hey Sentinel" to activate, hands-free
- **Real agent loop** — Iterates tool calls until the task is done (not single-pass)
- **ElevenLabs TTS** — Responds out loud with a custom British voice
- **Tool execution** — Controls lights, checks scores, plays music, fetches weather — all through conversation

### Mood Lighting + Music
Tell Sentinel "I'm in a Tyler the Creator mood" and it will:
1. Search Spotify and start playing the artist on shuffle
2. Download the album art
3. Extract the dominant color from the artwork
4. Set all Govee light strips and Philips Hue lights to match

### Smart Lighting
- **Govee** — Full control of all Govee light strips (color, brightness, power)
- **Philips Hue** — Hue Bridge integration with color control for Hue Go lights
- **Sports sync** — Lights automatically change to team colors when your team is playing

### Sports Tracker
- Live scores and next-game schedules via ESPN API
- Supports NFL, NBA, La Liga, and more
- Teams: Lions, Pistons, Michigan, Barcelona

### Spotify Integration
- OAuth PKCE flow — no server-side token storage
- Mini player with album art, playback controls, and device picker
- Auto-restore last session on page load

### Smart Home Control
- **SmartThings** — Samsung Frame TV power, art mode, HDMI switching, volume
- **Tesla** — Vehicle status and controls (in progress)

### Additional Widgets
- **Weather** — Real-time conditions via Open-Meteo (free, no API key)
- **Calendar** — Google + Microsoft OAuth with event display
- **News** — AI-summarized headlines via Claude API
- **3D Printer** — Creality Cloud printer monitoring
- **Bluetooth** — Web Bluetooth API for custom hardware (ESP32, Arduino)

### Security
- **Facial recognition lock** — Face.js powered lock screen
- **User profiles** — Per-user themes, device configs, and preferences
- **Four themes** — Cyan, Blue, Yellow, Mocha

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS |
| Backend | Node.js, Express 5 |
| AI Agent | Groq (Llama) with tool-use, Anthropic Claude for news |
| Voice | Web Speech API (recognition), ElevenLabs (TTS) |
| Image Processing | Sharp (album art color extraction) |
| Smart Home | Govee API, Philips Hue Bridge, SmartThings API |
| Music | Spotify Web API (PKCE OAuth) |
| Sports | ESPN API, Ball Don't Lie SDK |

## Project Structure

```
batcomputer-hub/
├── src/
│   ├── components/
│   │   ├── AuthAndProfiles/     # Face lock, profiles, onboarding
│   │   ├── Spotify/             # Player, OAuth, auto-restore
│   │   ├── VoiceAssistant.jsx   # Wake word detection + speech UI
│   │   ├── GoveeWidget.jsx      # Light strip controls
│   │   ├── PhillipsHueWidget.jsx # Hue Bridge controls
│   │   ├── SportsWidget.jsx     # Scores + team color sync
│   │   ├── WeatherWidget.jsx    # Current conditions
│   │   ├── CalendarWidget.jsx   # Google + Microsoft events
│   │   ├── NewsWidget.jsx       # AI-summarized headlines
│   │   ├── SmartThingsWidget.jsx # TV + device controls
│   │   ├── TeslaWidget.jsx      # Vehicle status
│   │   └── ...
│   ├── utils/                   # API wrappers + Sentinel logic
│   └── App.jsx                  # Main orchestrator
├── backend/
│   ├── server.js                # Express API + Sentinel agent loop
│   ├── .env                     # API keys (git-ignored)
│   └── .env.example             # Template for required keys
└── public/
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/JCUN23/J.O.S.H..git
cd J.O.S.H.

# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

### Configuration

Copy the environment template and fill in your API keys:

```bash
cp backend/.env.example backend/.env
```

Required keys (see `.env.example` for the full list):

| Key | Source | Required For |
|-----|--------|-------------|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | Sentinel AI (free tier) |
| `GOVEE_API_KEY` | Govee Home app → Settings → API | Light control |
| `HUE_BRIDGE_IP` / `HUE_USERNAME` | Hue Bridge local API | Hue light control |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) | Voice responses |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | News summaries |
| `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console | Calendar |
| `SMARTTHINGS_TOKEN` | [account.smartthings.com/tokens](https://account.smartthings.com/tokens) | TV / SmartThings |
| `SPOTIFY` | Spotify Developer Dashboard | Music (OAuth handled in-app) |

### Running

```bash
# Terminal 1 — Backend
cd backend
npm start          # Starts on :3001

# Terminal 2 — Frontend
npm run dev        # Starts on :5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

## Voice Commands

Activate with **"Hey Sentinel"** or click the mic button.

| Category | Examples |
|----------|---------|
| Lights | "Turn on the lights", "Set lights to blue", "Dim to 30%" |
| Music | "I'm in a jazz mood", "Play Tyler the Creator", "Skip" |
| Sports | "When do the Lions play next?", "Barcelona score" |
| TV | "Turn on the TV", "Switch to HDMI 2", "Art mode" |
| Info | "What's the weather?", "What's on my calendar?" |
| General | "Tell me a joke", "What time is it?" |

## Roadmap

- [ ] Game Day Mode — Auto-switch TV to live games via SmartThings
- [ ] Tesla integration — Vehicle controls and status
- [ ] ESP32 hardware controls — Physical buttons for Spotify via BLE
- [ ] AI news briefings — Morning summary spoken by Sentinel
- [ ] Multi-room audio sync

## Built With

Built using [Claude Code](https://claude.ai/claude-code) by Anthropic.

## License

This project is for personal/educational use.
