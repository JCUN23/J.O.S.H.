// Activity log: what the house did and why ("7:02pm Lions live -> Game Day: ...").
// Newest first, capped, persisted so it survives restarts.
const path = require('path');
const { createJsonStore } = require('./jsonStore');

const MAX_ENTRIES = 200;
const store = createJsonStore(
  process.env.ACTIVITY_STORE_PATH || path.join(__dirname, '..', 'data', 'activity.json'),
  { label: 'Activity log' }
);

let seq = 0;
const isFailure = (r) => /error|failed|missed|not configured|not connected|not found|0\/[1-9]/i.test(r);

// source: 'scene' | 'rule' | 'gameday' | 'voice' | 'panel' | 'manual' | 'system'
function log({ source = 'system', title, results = [], detail } = {}) {
  const entry = {
    id: `${Date.now().toString(36)}-${(seq++).toString(36)}`,
    at: new Date().toISOString(),
    source,
    title: String(title || 'Event'),
    results: results.map(String),
    ok: !results.some((r) => isFailure(String(r))),
    ...(detail ? { detail: String(detail) } : {}),
  };
  store.set('entries', [entry, ...(store.get('entries') || [])].slice(0, MAX_ENTRIES));
  return entry;
}

const list = (limit = 50) => (store.get('entries') || []).slice(0, Math.min(Math.max(limit, 1), MAX_ENTRIES));

module.exports = { log, list, MAX_ENTRIES };
