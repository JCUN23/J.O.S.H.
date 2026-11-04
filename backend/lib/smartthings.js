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
const { getValidToken, toStored } = require('./oauth');
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

// SmartThings' token endpoint is called with client credentials as Basic auth
// *and* in the form body (matches SmartThings' own working examples).
const basicAuth = () => 'Basic ' + Buffer.from(`${SMARTTHINGS_CLIENT_ID}:${SMARTTHINGS_CLIENT_SECRET}`).toString('base64');
const TOKEN_URL = 'https://auth-global.api.smartthings.com/oauth/token';

async function tokenRequest(params) {
  const { data } = await axios.post(TOKEN_URL,
    new URLSearchParams({ client_id: SMARTTHINGS_CLIENT_ID, client_secret: SMARTTHINGS_CLIENT_SECRET, ...params }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() } }
  );
  return data;
}

// Access tokens last ~24h; refresh tokens ~30 days and rotate on use, so refreshes
// go through the shared single-flight helper (concurrent refreshes would race).
const refreshWithClient = (refresh_token) => tokenRequest({ grant_type: 'refresh_token', refresh_token });

async function getSmartThingsToken() {
  if (SMARTTHINGS_CLIENT_ID && SMARTTHINGS_CLIENT_SECRET) {
    try {
      const t = await getValidToken('smartthings', refreshWithClient);
      if (t?.access_token) return t.access_token;
    } catch (err) {
      console.error('SmartThings token refresh failed:', err.response?.data || err.message);
    }
  }
  // Legacy fallback. PATs issued since Dec 2024 expire after 24h, so this is
  // only useful for quick tests; the OAuth login above is the real path.
  return SMARTTHINGS_PAT || null;
}

// Kept for callers that force a refresh. Returns true on success.
async function refreshSmartThingsToken() {
  const t = stState.tokens;
  if (!t.refresh_token) return false;
  try {
    store.set('smartthings', toStored(await refreshWithClient(t.refresh_token), t.refresh_token));
    return true;
  } catch (error) {
    console.error('SmartThings refresh error:', error.response?.data || error.message);
    return false;
  }
}

module.exports = { tokenRequest, SMARTTHINGS_CLIENT_ID, SMARTTHINGS_CLIENT_SECRET, SMARTTHINGS_PAT, SMARTTHINGS_BASE_URL, stState, getSmartThingsToken, refreshSmartThingsToken };
