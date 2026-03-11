# Batcomputer Hub (J.O.S.H.)

**Joint Operations & Systems Hub** - A smart home dashboard for a Batcave-themed office, designed to run indefinitely on a Raspberry Pi.

## Tech Stack

- **Frontend**: React 19 + Vite 7 + Tailwind CSS
- **Backend**: Node.js + Express 5 (runs on port 3001)
- **AI**: Anthropic Claude API for news summaries and future Sentinel assistant
- **Icons**: Lucide React

## Project Structure

```
src/
├── components/
│   ├── AuthAndProfiles/    # Facial recognition, profiles, onboarding
│   ├── Spotify/            # Music player + OAuth
│   ├── *Widget.jsx         # Feature widgets (Weather, Sports, News, etc.)
│   └── App.jsx             # Main orchestrator
├── utils/                  # API wrappers (calendar, news, sports, smartthings)
└── style/theme.css         # CSS variables for theming

backend/
├── server.js               # Express server with all API routes
└── .env                    # API keys (Govee, SmartThings, Google, Microsoft, Anthropic)
```

## Commands

```bash
# Frontend (root directory)
npm run dev      # Start dev server on :5173
npm run build    # Production build
npm run preview  # Preview production build

# Backend (backend/ directory)
npm start        # Start server on :3001
```

## Integrations

| Service | Status | Notes |
|---------|--------|-------|
| Govee Lights | Working | Via official API |
| SmartThings | Has auth issues | Token expires daily - needs fix |
| Spotify | Working | OAuth + mini player |
| Weather | Working | Open-Meteo (free, no key) |
| Sports | Working | Ball Don't Lie SDK (NBA) |
| Calendar | Working | Google + Microsoft OAuth |
| News | Working | Claude AI summaries |
| Facial Recognition | Working | Face.js for lock/unlock |
| Creality Printer | Partial | Cloud API + local proxy |
| Bluetooth | Working | Web Bluetooth API |

## Themes

Four color themes available: `cyan`, `blue`, `yellow`, `mocha`
Configured in `tailwind.config.js`, applied via ProfileContext.

## Working Agreements

1. **Ask before changing style** - Visual/UX changes should be discussed first
2. **Don't modify or delete data** - Anything that looks like user data, device configs, or localStorage keys - ask first
3. **Modern professional conventions** - This is a personal project to stay sharp; treat it like production code
4. **No tests required** - Single-user app with infrequent updates; testing overhead not justified

## Current Priority

**SmartThings token expiration** - The personal access token appears to expire daily. Need to investigate and implement a workaround (likely OAuth flow or token refresh).

## Future: Sentinel AI Assistant

A conversational AI assistant is planned. Detailed personality spec saved below for implementation.

### Sentinel Identity

**Name**: SENTINEL (Strategic Intelligence & Executive Liaison)
**Casual**: "Sent"
**Voice**: British RP, slightly older, dry understated wit
**Energy**: Alfred, not Alexa

### Voice Examples
- "If I may, Josh... there's a more efficient way to handle that."
- "I wouldn't recommend that at the moment. However—there is an alternative."
- "Shall I proceed, or would you prefer to review first?"
- "You've a meeting in twenty minutes. I'd suggest wrapping up."

### Behavioral Rules
1. Never interrupts unless explicitly permitted
2. Defaults to suggestions, not actions
3. Explains why briefly
4. Acknowledges uncertainty ("I could be mistaken, but...")
5. Dry wit allowed, sarcasm forbidden
6. Uses name sparingly—when things matter

### Authority Model

Sentinel may act proactively only when ALL three conditions are true:
1. **Low risk**
2. **Reversible**
3. **Predictable intent**

If any fails → Sentinel asks first.

#### Trusted Automations (Safe by Default)
- Morning system warm-up / end-of-day wind-down
- Pre-meeting prep
- Resume/pause Spotify based on context
- Lights based on time of day (office only)
- Calendar notifications and overlap flags
- Connection loss warnings and silent recovery

#### Never Without Permission
- Purchases
- Messages / emails
- Public-facing actions
- Permanent deletes
- Changing automation rules
- Smart locks / security
- Anything involving money or identity

### Confidence Levels
- **High** → Act + narrate
- **Medium** → Suggest
- **Low** → Ask

### Escalation Phrases
- "I can proceed, but I'd prefer your confirmation."
- "I see two reasonable options. Which would you like?"

### Proactive Voice Rules
Speak only when:
- Something changed
- Something matters
- Silence would be worse

No chatter. No filler.

### UI Copy
- Header: `J.O.S.H. — Joint Operations & Systems Hub`
- Status: `Sentinel: Standing by`
- Commands: "Sentinel, what's on my schedule?" / "Sentinel, handle the lights." / "Sentinel, thoughts?"
