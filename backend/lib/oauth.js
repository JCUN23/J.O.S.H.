// Shared "give me a valid access token" logic for every OAuth provider.
const store = require('./tokenStore');

// Refresh 5 minutes early so clients that cache the token (Spotify player) never
// hold an expired one between syncs.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

// One refresh per provider at a time. Spotify rotates refresh tokens, so two
// concurrent refreshes would race and the loser would invalidate the login.
const inflight = new Map();

// Normalize a provider token response into what we store.
function toStored(data, previousRefreshToken) {
  // Default to an hour only when expires_in is absent: a real 0 must stay 0 (`||` would turn it into 3600).
  const secs = Number(data.expires_in);
  const expiresIn = data.expires_in != null && Number.isFinite(secs) ? secs : 3600;
  return {
    access_token: data.access_token,
    // Google/Microsoft often omit refresh_token on refresh: keep the old one.
    refresh_token: data.refresh_token || previousRefreshToken || null,
    expires_at: Date.now() + expiresIn * 1000,
    scope: data.scope,
  };
}

// refreshFn(refreshToken) -> provider token response ({ access_token, expires_in, ... })
async function getValidToken(provider, refreshFn) {
  const t = store.get(provider);
  if (!t) return null;
  if (t.access_token && t.expires_at && Date.now() < t.expires_at - REFRESH_SKEW_MS) return t;
  if (!t.refresh_token || !refreshFn) return null;

  if (!inflight.has(provider)) {
    inflight.set(provider, (async () => {
      try {
        const data = await refreshFn(t.refresh_token);
        return store.set(provider, toStored(data, t.refresh_token));
      } catch (err) {
        const code = err.response?.data?.error;
        if (code === 'invalid_grant' || err.response?.status === 400 || err.response?.status === 401) {
          // Revoked or expired login: forget it so the UI shows "connect" instead of erroring forever.
          console.warn(`${provider} refresh rejected (${code || err.response?.status}); clearing stored login.`);
          store.clear(provider);
          return null;
        }
        throw err; // network/5xx: keep the login, let the caller report the failure
      } finally {
        inflight.delete(provider);
      }
    })());
  }
  return inflight.get(provider);
}

// What browsers are allowed to see: never the refresh token.
const publicView = (t) => (t ? { access_token: t.access_token, expires_at: t.expires_at } : null);

module.exports = { getValidToken, toStored, publicView };
