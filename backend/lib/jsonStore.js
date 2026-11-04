// Tiny durable JSON-file store used for server-side state (logins, registered faces).
// Atomic writes (temp file + rename), 0600 perms, corrupt files parked instead of
// silently overwritten. Sync fs is fine: files are tiny and writes are rare.
const fs = require('fs');
const path = require('path');

function createJsonStore(filePath, { label = path.basename(filePath) } = {}) {
  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        const parked = `${filePath}.corrupt-${Date.now()}`;
        try { fs.renameSync(filePath, parked); } catch { /* nothing to park */ }
        console.error(`${label} unreadable (${err.message}); moved to ${parked}, starting empty.`);
      }
      cache = {};
    }
    return cache;
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  }

  return {
    path: filePath,
    get: (key) => load()[key] ?? null,
    set(key, value) {
      load();
      cache[key] = value;
      persist();
      return cache[key];
    },
    clear(key) {
      load();
      if (key in cache) {
        delete cache[key];
        persist();
      }
    },
  };
}

module.exports = { createJsonStore };
