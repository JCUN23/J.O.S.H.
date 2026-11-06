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
      description: "Control Samsung Frame TV via SmartThings — power, art mode, volume, HDMI input, home screen",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "art_mode_on", "art_mode_off", "mute", "volume", "hdmi", "home"], description: "The action to perform" },
          value: { type: "string", description: "For volume: number 0-100. For hdmi: 1-4" }
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
      description: "Get current sports information, scores, schedules, or game updates for any team or league",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The sports question or request (e.g., 'NFL games today', 'Pistons score', 'next Lions game')" }
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
      description: "Search for and play music on Spotify. Use for artist requests, song requests, mood requests, or genre requests. Can also set the room lights to match the album/artist colors for an immersive vibe.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to play — artist name, song title, album, genre, or mood (e.g. 'Tyler the Creator', 'chill lo-fi', 'Bohemian Rhapsody')" },
          set_lights: { type: "boolean", description: "Whether to set room lights to match the album art colors. Default true for mood/vibe requests, false for simple play requests." }
        },
        required: ["query"]
      }
    }
  }
];

module.exports = { SENTINEL_TOOLS };
