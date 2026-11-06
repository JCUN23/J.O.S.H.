// Central config. Read once, after dotenv has loaded (server.js does that first).
// Modules import from here instead of touching process.env directly.
module.exports = {
  PORT: Number(process.env.PORT) || 3001,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://127.0.0.1:5173',
  GOVEE_API_KEY: process.env.GOVEE_API_KEY,
  GOVEE_BASE_URL: 'https://developer-api.govee.com/v1',
  HUE_BRIDGE_IP: process.env.HUE_BRIDGE_IP,
  HUE_USERNAME: process.env.HUE_USERNAME,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  // Groq retires models regularly (llama-3.3-70b-versatile shut down 2026-08-16, which
  // silently broke Sentinel). Swap models here via .env, not in code.
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  // gpt-oss is a reasoning model: its thinking counts against max_tokens. Keep it low
  // for snappy home commands. Set GROQ_REASONING_EFFORT= (empty) for non-reasoning models.
  GROQ_REASONING_EFFORT: process.env.GROQ_REASONING_EFFORT ?? 'low',
  GROQ_MAX_TOKENS: Number(process.env.GROQ_MAX_TOKENS) || 1024,
  // Spotify PKCE client id is public (it's in the frontend bundle too); needed for server-side refresh.
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '0982022f80f240138fd76bad2c53f3bd',
};
