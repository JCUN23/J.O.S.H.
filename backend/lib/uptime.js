// "The backend went down" alerts. A process can't report its own power loss or a
// sleeping laptop in real time, so: a heartbeat file every minute, and on startup, if
// the last heartbeat is old, push "Sentinel is back, it was down from X to Y".
// Crashes (uncaught errors) push immediately before exiting.
const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { notify } = require('./notify');
const activity = require('./activity');

const store = createJsonStore(process.env.HEARTBEAT_STORE_PATH || path.join(__dirname, '..', 'data', 'heartbeat.json'),
  { label: 'Heartbeat store' });
const GAP_MS = 3 * 60 * 1000;

const clock = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const duration = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

// Exported for tests: decide what to say about the gap before this start.
function downtimeReport(last, now = Date.now()) {
  if (!last?.at || now - last.at < GAP_MS) return null;
  const how = last.crashed ? `crashed (${last.crashed})` : last.clean ? 'was stopped' : 'went quiet (asleep, off or killed)';
  return { title: `Sentinel is back after ${duration(now - last.at)}`,
    message: `Backend ${how} at ${clock(last.at)}. Back at ${clock(now)}. Rules due in between were skipped.` };
}

function start({ intervalMs = 60_000 } = {}) {
  const report = downtimeReport(store.get('last'));
  if (report) {
    activity.log({ source: 'system', title: report.title, results: [report.message] });
    notify({ ...report, category: 'system', priority: 4, tags: ['warning'] });
  }
  const beat = (extra = {}) => store.set('last', { at: Date.now(), pid: process.pid, ...extra });
  beat();
  setInterval(beat, intervalMs).unref();

  const stop = (signal) => { beat({ clean: true }); process.exit(signal === 'SIGINT' ? 130 : 0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const crash = (err) => {
    console.error('Fatal:', err);
    beat({ crashed: String(err?.message || err).slice(0, 120) });
    notify({ title: 'Sentinel crashed', message: String(err?.stack || err).slice(0, 400), category: 'system', priority: 5, tags: ['rotating_light'] })
      .finally(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000).unref();   // never hang on a dead network
  };
  process.once('uncaughtException', crash);
  process.once('unhandledRejection', crash);
}

module.exports = { start, downtimeReport };
