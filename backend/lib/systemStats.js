// Pi hardware diagnostics: temperature, CPU, RAM, disk, fan, throttling. Read straight
// from Linux (/sys, /proc) and the Pi firmware (vcgencmd). Anything a machine doesn't
// have (a Mac in dev, no fan, no vcgencmd) comes back null, never an error.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Overridable roots so tests can point at a fake /sys and /proc
const SYS = () => process.env.SYSTEM_SYS_ROOT || '/sys';
const PROC = () => process.env.SYSTEM_PROC_ROOT || '/proc';
const read = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } };

function cpuTempC() {
  const raw = read(path.join(SYS(), 'class/thermal/thermal_zone0/temp'));
  return raw && /^\d+$/.test(raw) ? Math.round(Number(raw) / 100) / 10 : null;   // millidegrees
}

function memory() {
  const info = read(path.join(PROC(), 'meminfo'));
  if (!info) return { totalMb: Math.round(os.totalmem() / 1048576), usedMb: Math.round((os.totalmem() - os.freemem()) / 1048576), swapTotalMb: null, swapUsedMb: null };
  const kb = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(info)?.[1] || 0);
  const mb = (x) => Math.round(x / 1024);
  // MemAvailable, not MemFree: Linux uses spare RAM as disk cache, which it gives back
  return { totalMb: mb(kb('MemTotal')), usedMb: mb(kb('MemTotal') - kb('MemAvailable')),
    swapTotalMb: mb(kb('SwapTotal')), swapUsedMb: mb(kb('SwapTotal') - kb('SwapFree')) };
}

// CPU busy % since the previous call (first call: since boot)
let lastCpu = null;
function cpuPercent() {
  const now = os.cpus().reduce((a, c) => {
    const t = c.times; const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { total: a.total + total, idle: a.idle + t.idle };
  }, { total: 0, idle: 0 });
  const prev = lastCpu; lastCpu = now;
  const base = prev && now.total > prev.total ? { total: now.total - prev.total, idle: now.idle - prev.idle } : now;
  return base.total ? Math.round((1 - base.idle / base.total) * 100) : null;
}

function disk(dir = '/') {
  try {
    const s = fs.statfsSync(dir);
    const gb = (blocks) => Math.round((blocks * s.bsize) / 1e8) / 10;
    return { totalGb: gb(s.blocks), usedGb: gb(s.blocks - s.bavail) };
  } catch { return null; }
}

// Pi 5 active cooler RPM (hwmon number varies between boots)
function fanRpm() {
  const base = path.join(SYS(), 'devices/platform/cooling_fan/hwmon');
  try {
    for (const d of fs.readdirSync(base)) {
      const v = read(path.join(base, d, 'fan1_input'));
      if (v && /^\d+$/.test(v)) return Number(v);
    }
  } catch { /* no fan */ }
  return null;
}

// vcgencmd get_throttled -> throttled=0x50005. Low bits: happening now. Bits 16+: since boot.
const FLAGS = [[0, 'under-voltage'], [1, 'CPU speed capped'], [2, 'throttled'], [3, 'temperature limit']];
function decodeThrottled(hex) {
  const v = parseInt(String(hex).replace(/^throttled=/, ''), 16);
  if (Number.isNaN(v)) return null;
  return { raw: `0x${v.toString(16)}`,
    now: FLAGS.filter(([b]) => v & (1 << b)).map(([, n]) => n),
    sinceBoot: FLAGS.filter(([b]) => v & (1 << (b + 16))).map(([, n]) => n) };
}
const throttled = () => new Promise((resolve) => {
  execFile(process.env.VCGENCMD || 'vcgencmd', ['get_throttled'], { timeout: 1500 }, (err, out) =>
    resolve(err ? null : decodeThrottled(String(out).trim())));
});

async function snapshot() {
  const model = read(path.join(PROC(), 'device-tree/model'))?.replace(/\0/g, '') || null;
  const [load1, load5, load15] = os.loadavg();
  return {
    model,
    tempC: cpuTempC(),
    cpuPercent: cpuPercent(),
    cores: os.cpus().length,
    load: { one: +load1.toFixed(2), five: +load5.toFixed(2), fifteen: +load15.toFixed(2) },
    memory: memory(),
    disk: disk(),
    fanRpm: fanRpm(),
    throttled: await throttled(),
    uptimeS: Math.round(os.uptime()),
    backend: { rssMb: Math.round(process.memoryUsage().rss / 1048576), uptimeS: Math.round(process.uptime()) },
    at: new Date().toISOString(),
  };
}

// One spoken/written line for Alfred ("how's the Pi doing?")
function summary(s) {
  const bits = [];
  if (s.tempC != null) bits.push(`${Math.round(s.tempC)} degrees Celsius`);
  if (s.cpuPercent != null) bits.push(`CPU ${s.cpuPercent}%`);
  if (s.memory?.totalMb) bits.push(`RAM ${(s.memory.usedMb / 1024).toFixed(1)} of ${(s.memory.totalMb / 1024).toFixed(1)} GB`);
  if (s.disk) bits.push(`disk ${s.disk.usedGb} of ${s.disk.totalGb} GB`);
  const days = Math.floor(s.uptimeS / 86400); const hrs = Math.floor((s.uptimeS % 86400) / 3600);
  bits.push(`up ${days ? `${days} day${days === 1 ? '' : 's'} ` : ''}${hrs} hour${hrs === 1 ? '' : 's'}`);
  let health = '';
  if (s.throttled?.now.length) health = ` Warning: ${s.throttled.now.join(', ')} right now.`;
  else if (s.throttled?.sinceBoot.length) health = ` No problems right now, but ${s.throttled.sinceBoot.join(', ')} happened since boot.`;
  else if (s.throttled) health = ' No throttling or power problems.';
  return `${s.model || 'The host'}: ${bits.join(', ')}.${health}`;
}

// Power/heat watch: under-voltage is the classic cause of random Pi weirdness (SD card
// corruption, USB mic dropouts), and the widget only shows it if someone's looking.
// Tell Josh's phone when it's happening now, at most once per COOLDOWN per problem.
const COOLDOWN_MS = 6 * 3600_000;
const HOT_C = 80;                          // the Pi 5 starts throttling here
const lastAlert = {};
async function checkHealth({ now = Date.now(), notify = require('./notify').notify, stats } = {}) {
  const s = stats || await snapshot();
  const problems = [...(s.throttled?.now || [])];
  if (s.tempC != null && s.tempC >= HOT_C && !problems.includes('temperature limit')) problems.push(`${Math.round(s.tempC)} C`);
  const fresh = problems.filter((p) => !lastAlert[p] || now - lastAlert[p] > COOLDOWN_MS);
  if (!fresh.length) return [];
  fresh.forEach((p) => { lastAlert[p] = now; });
  const power = fresh.includes('under-voltage');
  notify({
    title: power ? 'Pi power problem: under-voltage' : `Pi running hot: ${fresh.join(', ')}`,
    message: power
      ? 'The power supply can\'t keep up. Use the official 27 W Pi 5 supply, or a short good USB-C cable. It can corrupt the SD card and drop the USB mic.'
      : `${summary(s)} Check the fan and airflow.`,
    category: 'system', priority: 4, tags: ['warning'],
  });
  console.warn(`🩺 Pi health alert: ${fresh.join(', ')}`);
  return fresh;
}

let healthTimer = null;
function startHealthWatch(intervalMs = 5 * 60_000) {
  if (healthTimer) return;
  const tick = () => checkHealth().catch(() => {});
  setTimeout(tick, 60_000).unref?.();
  healthTimer = setInterval(tick, intervalMs);
  healthTimer.unref?.();
}
const _resetHealth = () => { for (const k of Object.keys(lastAlert)) delete lastAlert[k]; };

module.exports = { snapshot, summary, decodeThrottled, checkHealth, startHealthWatch, _resetHealth };
