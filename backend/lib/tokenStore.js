// Server-side OAuth token store: one login per provider, shared by every device
// (laptop, wall panel, phone), surviving restarts and deploys.
// File: backend/data/tokens.json (override with TOKEN_STORE_PATH), git-ignored.
const path = require('path');
const { createJsonStore } = require('./jsonStore');

const STORE_PATH = process.env.TOKEN_STORE_PATH || path.join(__dirname, '..', 'data', 'tokens.json');
const store = createJsonStore(STORE_PATH, { label: 'Token store' });

const get = (provider) => store.get(provider);
const set = (provider, tokens) => store.set(provider, { ...tokens, updated_at: Date.now() });
const clear = (provider) => store.clear(provider);

function isConnected(provider) {
  const t = get(provider);
  return Boolean(t && (t.refresh_token || (t.access_token && t.expires_at > Date.now())));
}

module.exports = { get, set, clear, isConnected, STORE_PATH };
