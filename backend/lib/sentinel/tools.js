// Sentinel tool schemas (OpenAI/Groq format)

// Define Sentinel's available tools/capabilities
// FORMAT: OpenAI/Groq tool format. Each entry describes a function the model can call.
// The model reads these and decides WHEN to call them. Your code decides WHAT happens.
const SENTINEL_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_all_lights",
      description: "Control ALL the lights at once (every Govee and Hue light). Use this for 'the lights', 'all the lights', 'lights on/off' with no specific light named.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "color", "brightness"], description: "The action to perform" },
          value: { type: "string", description: "For color: hex like #ff0000 or a name (red, blue, purple, warm...). For brightness: 1-100 (percent)" }
        },
        required: ["action"]
      }
    }
  },
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
      description: "Control the Philips Hue lights: two Hue Go portable lamps, 'Left Go' and 'Right Go'",
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
      description: "Control what's playing on Spotify: resume, pause, skip, go back, volume; now_playing ('what's playing'), like (save to Liked Songs), queue (add a song: value = what), more_like_this (shuffles the current artist; Spotify doesn't offer recommendations to this app). Optionally on a named device ('The Frame'). To start something new, use play_music.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next", "previous", "volume", "search_and_play", "now_playing", "like", "queue", "more_like_this"], description: "play = resume" },
          value: { type: "string", description: "For volume: 0-100. For search_and_play / queue: the song" },
          device: { type: "string", description: "Where, if Josh names a device (e.g. 'The Frame'). Omit for the active device." }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_tv",
      description: "Control the Samsung Frame TV (The Frame): power, art mode, open an app (YouTube, Netflix, ESPN, Peacock, HBO Max, Fubo, Spotify...), volume, mute, play/pause, HDMI input, home screen",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "art_mode_on", "art_mode_off", "mute", "volume", "hdmi", "home", "open_app", "play", "pause"], description: "The action to perform" },
          value: { type: "string", description: "For open_app: the app name. For volume: steps to move, e.g. '5' louder or '-5' quieter. For hdmi: 1-4" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "game_day_mode",
      description: "Activate Game Day Mode — wakes the TV out of art mode, opens the streaming app the game is on, and sets all lights to the team's colors. Use when a followed team's game is about to start or is live.",
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
      description: "Josh's Google Calendar events (all his calendars, including shared ones). Use for 'what's on my calendar', 'am I free tomorrow', 'what's this weekend look like'.",
      parameters: { type: "object", properties: { when: { type: "string", enum: ["today", "tomorrow", "weekend", "week"], description: "Which days. Default week (next 7 days)." } } }
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
      description: "Current headlines from the news widget's sources.",
      parameters: { type: "object", properties: { category: { type: "string", enum: ["all", "technology", "world", "sports", "business"], description: "Default all" } } }
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
      name: "system_status",
      description: "Health of the Raspberry Pi that runs you: CPU temperature, CPU load, RAM, disk space, uptime, throttling or power problems. Use for 'how's the Pi doing', 'is the server hot', 'how much memory is free'.",
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
  },
  {
    type: "function",
    function: {
      name: "set_timer",
      description: "Start a countdown timer. Alfred announces it on the panel and pushes it to Josh's phone when it ends.",
      parameters: {
        type: "object",
        properties: {
          minutes: { type: "number", description: "Minutes (can combine with seconds)" },
          seconds: { type: "number", description: "Seconds" },
          label: { type: "string", description: "Optional name, e.g. 'pasta', 'laundry'" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description: "Remind Josh of something at a time (spoken on the panel + phone push). Use 'at' for a clock time, 'in_minutes' for relative ('in 2 hours' = 120).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remind him, e.g. 'call Mom'" },
          at: { type: "string", description: "Local time: '17:00', '5:30 pm', or 'YYYY-MM-DD HH:MM' for another day. A time that already passed today means tomorrow." },
          in_minutes: { type: "number", description: "Minutes from now, instead of at" }
        },
        required: ["text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_timers",
      description: "What timers and reminders are running, with time left.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "cancel_timer",
      description: "Cancel timers/reminders: by label ('pasta'), by kind ('timer', 'reminder'), or 'all'.",
      parameters: { type: "object", properties: { label: { type: "string" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "get_briefing",
      description: "Josh's rundown of the day in one go: weather, today's calendar, his teams' games, today's reminders. Use for 'brief me', 'what's my day look like', 'catch me up'. Read it out as returned.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Look something up on the live web: news, results of games outside Josh's teams, business hours, facts that may have changed, anything the other tools don't cover. Not for things another tool handles (his teams, calendar, weather, devices).",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to find out, as a clear question" } }, required: ["query"] }
    }
  },
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Save something Josh explicitly asks you to remember long-term (a preference, a date, a detail). Only when he asks ('remember that...', 'keep in mind...').",
      parameters: { type: "object", properties: { fact: { type: "string", description: "The fact in one clear sentence, e.g. 'Josh likes the lights at 40% after 9 PM'" } }, required: ["fact"] }
    }
  },
  {
    type: "function",
    function: {
      name: "forget_fact",
      description: "Remove things from long-term memory when Josh asks you to forget them. 'everything' clears it.",
      parameters: { type: "object", properties: { about: { type: "string", description: "Words that identify what to forget" } }, required: ["about"] }
    }
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description: "What's in long-term memory ('what do you remember about me').",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Add an event to Josh's Google Calendar ('add dinner Friday at 7', 'put the dentist on Tuesday at 9:30'). Work out the exact date from today's date. Confirm what you added.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "Local start 'YYYY-MM-DDTHH:MM', or 'YYYY-MM-DD' for an all-day event" },
          duration_minutes: { type: "number", description: "Default 60" },
          calendar: { type: "string", description: "Only if Josh names a calendar (e.g. a shared one); default is his own" }
        },
        required: ["title", "start"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "undo_calendar_event",
      description: "Remove the event you just added ('undo that', 'take that off the calendar').",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "control_panel",
      description: "Control the wall panel's display: show (scroll to and highlight a widget, unhiding it), hide a widget, theme color, light/dark mode, lock the screen, idle (standby clock). Unlocking is face-only: you can't unlock it.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["show", "hide", "theme", "mode", "lock", "idle"] },
          target: { type: "string", description: "show/hide: weather, calendar, sports, spotify, news, govee, hue, printer, scenes, activity, tv, quick_controls, system (Pi diagnostics). theme: cyan, yellow, mocha. mode: light, dark." }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_to_phone",
      description: "Push a message to Josh's phone ('send me that', 'text me the score', 'send me a note to buy milk'). For 'send me that', send what you just told him.",
      parameters: { type: "object", properties: { message: { type: "string" }, title: { type: "string", description: "Short title (optional)" } }, required: ["message"] }
    }
  },
  {
    type: "function",
    function: {
      name: "list_rules",
      description: "The home automation rules and whether each is on ('what rules are on').",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "set_rule",
      description: "Turn an automation rule on or off by name ('turn off the sunset rule').",
      parameters: { type: "object", properties: { name: { type: "string", description: "Words from the rule's name" }, enabled: { type: "boolean" } }, required: ["name", "enabled"] }
    }
  },
  {
    type: "function",
    function: {
      name: "activity_summary",
      description: "What the house did recently: rules that ran, Game Day, prints, presence, failures. 'What happened while I was out' = since_away.",
      parameters: { type: "object", properties: { hours: { type: "number", description: "Look back this many hours (default 12)" }, since_away: { type: "boolean", description: "Since Josh last left home" } } }
    }
  },
  {
    type: "function",
    function: {
      name: "presence_status",
      description: "Who is home and since when ('is anyone home', 'when did I get home').",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Change an existing calendar event: move it (new_start), rename it, or change its length. Finds it by words in its title within the next 30 days.",
      parameters: {
        type: "object",
        properties: {
          match: { type: "string", description: "Words from the event's title" },
          date: { type: "string", description: "Its current day 'YYYY-MM-DD', if known (narrows the search)" },
          new_start: { type: "string", description: "New local start 'YYYY-MM-DDTHH:MM' (keeps its length)" },
          new_title: { type: "string" },
          duration_minutes: { type: "number" }
        },
        required: ["match"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete a calendar event. First call WITHOUT confirm to find it; tell Josh what you found and ask; only after he says yes, call again with confirm: true.",
      parameters: {
        type: "object",
        properties: { match: { type: "string" }, date: { type: "string", description: "'YYYY-MM-DD' if known" }, confirm: { type: "boolean" } },
        required: ["match"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "printer_control",
      description: "Pause, resume or stop the current 3D print. stop can't be undone: first call without confirm, ask Josh, then call with confirm: true only after he says yes.",
      parameters: { type: "object", properties: { action: { type: "string", enum: ["pause", "resume", "stop"] }, confirm: { type: "boolean" } }, required: ["action"] }
    }
  }
];

module.exports = { SENTINEL_TOOLS };
