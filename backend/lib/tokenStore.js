// Server-side OAuth token store: one JSON file, so every device (laptop, wall panel,
// phone) shares a single login per provider and logins survive restarts and deploys.
//
// File lives at backend/data/tokens.json (override with TOKEN_STORE_PATH), git-ignored,
// written with 0600 perms. Writes are atomic (temp file + rename) so a crash mid-write
// can't leave a truncated file behind. Sync fs is fine: the file is tiny and writes
// only happen on login/refresh.
const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.TOKEN_STORE_PATH || path.join(__dirname, '..', 'data', 'tokens.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Don't silently overwrite a corrupt file on the next write: park it for inspection.
      const parked = `${STORE_PATH}.corrupt-${Date.now()}`;
      try { fs.renameSync(STORE_PATH, parked); } catch { /* nothing to park */ }
      console.error(`Token store unreadable (${err.message}); moved to ${parked}, starting empty.`);
    }
    cache = {};
  }
  return cache;
}

function persist() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true, mode: 0o700 });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STORE_PATH);
}

function get(provider) {
  return load()[provider] || null;
}

function set(provider, tokens) {
  load();
  cache[provider] = { ...tokens, updated_at: Date.now() };
  persist();
  return cache[provider];
}

function clear(provider) {
  load();
  if (provider in cache) {
    delete cache[provider];
    persist();
  }
}

function isConnected(provider) {
  const t = get(provider);
  return Boolean(t && (t.refresh_token || (t.access_token && t.expires_at > Date.now())));
}

module.exports = { get, set, clear, isConnected, STORE_PATH };
