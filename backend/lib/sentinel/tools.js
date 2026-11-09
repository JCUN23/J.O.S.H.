// Sentinel tool schemas (OpenAI/Groq format)

// Define Sentinel's available tools/capabilities
// FORMAT: OpenAI/Groq tool format. Each entry describes a function the model can call.
// The model reads these and decides WHEN to call them. Your code decides WHAT happens.
const SENTINEL_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_govee_lights",
      description: "Control Govee smart lights (light strips, rope lights, lamps) - turn on/off, change color, adjust brightness",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "color", "brightness"], description: "The action to perform" },
          value: { type: "string", description: "For color: hex like #ff0000 or name (red, blue, purple, cyan, white, warm, cool). For brightness: number 0-100" },
          device: { type: "string", description: "Optional specific device name. If omitted, applies to all Govee devices" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_hue_lights",
      description: "Control Philips Hue lights (Hue Go portable lights, Hue color lamps). Devices: 'Left Go', 'Right Go', 'Hue color lamp 1/2/3'",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "color", "brightness"], description: "The action to perform" },
          value: { type: "string", description: "For color: hex like #ff0000 or name (red, blue, purple, cyan, white, warm, cool). For brightness: number 1-254" },
          device: { type: "string", description: "Optional: 'Left Go', 'Right Go', 'all', or a lamp name. If omitted, applies to all Hue lights" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_spotify",
      description: "Control Spotify music playback",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next", "previous", "volume", "search_and_play"], description: "The action to perform" },
          value: { type: "string", description: "For volume: number 0-100. For search_and_play: song name or 'song by artist'" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_tv",
      description: "Control the Samsung Frame TV — power, art mode, volume, mute, HDMI input, home screen",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "art_mode_on", "art_mode_off", "mute", "volume", "hdmi", "home"], description: "The action to perform" },
          value: { type: "string", description: "For volume: steps to move, e.g. '5' louder or '-5' quieter. For hdmi: 1-4" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "game_day_mode",
      description: "Activate Game Day Mode — wakes the TV from art mode, navigates to the home screen for streaming apps, and sets all lights to the team's colors. Use when a followed team's game is about to start or is live.",
      parameters: {
        type: "object",
        properties: {
          team: { type: "string", description: "Team name: 'Lions', 'Pistons', 'Michigan', 'Barcelona'" }
        },
        required: ["team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Get the current time and date",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather information",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_calendar",
      description: "Get upcoming calendar events",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sports",
      description: "Real sports data from ESPN: today's games, start times, TV network, live scores and finals. Josh follows the Detroit Lions, Michigan Football, Michigan Basketball, Detroit Pistons and FC Barcelona. Ask with no team for today's games across his teams, name a team for its game/next game/last result, or name a league (NFL, NBA, college football, La Liga...) for that league's games today.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The question in plain words, e.g. 'games today', 'Lions score', 'when do the Pistons play', 'NBA games tonight'" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "Get current news headlines",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "printer_status",
      description: "Get the 3D printer's (Bambu P2S) current status: idle/printing, job name, percent done, time remaining, temperatures. Use for 'how's my print', 'when is the print done'.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "activate_scene",
      description: "Activate a lighting/TV scene by name. Available scenes: Movie Night, Relax, Focus, All Bright, Goodnight, All Off. Use when the user asks for a mood or routine (e.g. 'movie night', 'goodnight', 'I'm going to bed', 'time to focus').",
      parameters: {
        type: "object",
        properties: { scene: { type: "string", description: "Scene name, e.g. 'Movie Night'" } },
        required: ["scene"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "play_music",
      description: "Play music on Spotify: an artist, song, album, mood, genre, or a playlist by name (Josh's own playlists and saved shortcuts like Discover Weekly work by name). Can play on a specific device (e.g. 'The Frame' TV, which opens Spotify on it if needed) and set the room lights to match the album art.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to play: artist, song, album, playlist name, genre or mood (e.g. 'Tyler the Creator', 'Discover Weekly', 'chill lo-fi')" },
          kind: { type: "string", enum: ["playlist", "album", "artist", "track"], description: "Set when Josh says what it is ('my workout playlist', 'the album ...')" },
          device: { type: "string", description: "Where to play, if Josh names a place or device (e.g. 'The Frame', 'office', 'phone'). Omit to use the active device." },
          set_lights: { type: "boolean", description: "Whether to set room lights to match the album art colors. Default true for mood/vibe requests, false for simple play requests." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_playlist_shortcut",
      description: "Remember the playlist (or album) playing on Spotify right now under a name, so 'play <name>' works later. Use when Josh says 'save this playlist as X' or 'remember this as X'. Needed for Spotify-made playlists like Discover Weekly, which search can't find.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "What Josh will call it, e.g. 'Discover Weekly'" } },
        required: ["name"]
      }
    }
  }
];

module.exports = { SENTINEL_TOOLS };
