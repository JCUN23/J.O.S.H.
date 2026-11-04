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
};
