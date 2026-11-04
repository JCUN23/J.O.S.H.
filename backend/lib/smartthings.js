// SmartThings token state + helpers (shared by routes, Game Day, Sentinel tools)
const axios = require('axios');

const SMARTTHINGS_CLIENT_ID = process.env.SMARTTHINGS_CLIENT_ID;
const SMARTTHINGS_CLIENT_SECRET = process.env.SMARTTHINGS_CLIENT_SECRET;
const SMARTTHINGS_PAT = process.env.SMARTTHINGS_TOKEN; // Legacy PAT fallback
const SMARTTHINGS_BASE_URL = 'https://api.smartthings.com/v1';

// In-memory token storage (persists until server restart)
// Persisted via the token store, so logins survive restarts/deploys. Getter/setter
// keeps every existing `stState.tokens.x` / `stState.tokens = {...}` call site working.
const store = require('./tokenStore');
const EMPTY = Object.freeze({ access_token: null, refresh_token: null, expires_at: null });
const stState = {
  get tokens() {
    return store.get('smartthings') || EMPTY;
  },
  set tokens(value) {
    if (value && value.access_token) store.set('smartthings', value);
    else store.clear('smartthings');
  },
};

// Helper to get valid SmartThings token
async function getSmartThingsToken() {
  // If we have OAuth tokens, use them
  if (stState.tokens.access_token) {
    // Check if token is expired (with 5 min buffer)
    if (stState.tokens.expires_at && Date.now() < stState.tokens.expires_at - 300000) {
      return stState.tokens.access_token;
    }
    // Try to refresh if we have a refresh token
    if (stState.tokens.refresh_token) {
      try {
        const refreshed = await refreshSmartThingsToken();
        if (refreshed) return stState.tokens.access_token;
      } catch (err) {
        console.error('SmartThings token refresh failed:', err);
      }
    }
  }
  // Fall back to PAT if available
  return SMARTTHINGS_PAT || null;
}

// Refresh SmartThings token
async function refreshSmartThingsToken() {
  if (!stState.tokens.refresh_token || !SMARTTHINGS_CLIENT_ID || !SMARTTHINGS_CLIENT_SECRET) {
    return false;
  }

  try {
    const response = await axios.post('https://auth-global.api.smartthings.com/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: SMARTTHINGS_CLIENT_ID,
        client_secret: SMARTTHINGS_CLIENT_SECRET,
        refresh_token: stState.tokens.refresh_token
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    stState.tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || stState.tokens.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('SmartThings token refreshed successfully');
    return true;
  } catch (error) {
    console.error('SmartThings refresh error:', error.response?.data || error.message);
    return false;
  }
}

module.exports = { SMARTTHINGS_CLIENT_ID, SMARTTHINGS_CLIENT_SECRET, SMARTTHINGS_PAT, SMARTTHINGS_BASE_URL, stState, getSmartThingsToken, refreshSmartThingsToken };
