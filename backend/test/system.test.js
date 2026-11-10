const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startApp } = require('./helpers');

// A fake Pi: /sys and /proc files, plus a vcgencmd that reports throttling
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-'));
const put = (p, text) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), text); };
put('sys/class/thermal/thermal_zone0/temp', '52650\n');
put('sys/devices/platform/cooling_fan/hwmon/hwmon3/fan1_input', '2840\n');
put('proc/meminfo', 'MemTotal:        2009000 kB\nMemFree:          150000 kB\nMemAvailable:     870000 kB\nSwapTotal:        524284 kB\nSwapFree:         400000 kB\n');
put('proc/device-tree/model', 'Raspberry Pi 5 Model B Rev 1.0\0');
const vc = path.join(root, 'vcgencmd');
fs.writeFileSync(vc, '#!/bin/sh\necho throttled=0x50000\n', { mode: 0o755 });
process.env.SYSTEM_SYS_ROOT = path.join(root, 'sys');
process.env.SYSTEM_PROC_ROOT = path.join(root, 'proc');
process.env.VCGENCMD = vc;

const stats = require('../lib/systemStats');

test('Pi diagnostics: temp, RAM (available, not free), fan, model, throttle history', async () => {
  const s = await stats.snapshot();
  assert.equal(s.model, 'Raspberry Pi 5 Model B Rev 1.0');
  assert.equal(s.tempC, 52.7);
  assert.equal(s.fanRpm, 2840);
  assert.deepEqual(s.memory, { totalMb: 1962, usedMb: 1112, swapTotalMb: 512, swapUsedMb: 121 });
  assert.deepEqual(s.throttled, { raw: '0x50000', now: [], sinceBoot: ['under-voltage', 'throttled'] });
  assert.ok(s.disk.totalGb > 0 && s.cpuPercent >= 0 && s.uptimeS > 0);
  const line = stats.summary(s);
  assert.match(line, /^Raspberry Pi 5 Model B Rev 1.0: 53 degrees Celsius, CPU \d+%, RAM 1\.1 of 1\.9 GB/);
  assert.match(line, /No problems right now, but under-voltage, throttled happened since boot\./);
});

test('throttle decoding: happening now vs since boot; all clear', () => {
  assert.deepEqual(stats.decodeThrottled('throttled=0x5').now, ['under-voltage', 'throttled']);
  assert.deepEqual(stats.decodeThrottled('throttled=0x0'), { raw: '0x0', now: [], sinceBoot: [] });
  assert.equal(stats.decodeThrottled('garbage'), null);
});

test('not a Pi (Mac in dev): nulls, not errors; GET /api/system works', async (t) => {
  process.env.SYSTEM_SYS_ROOT = path.join(root, 'nope');
  process.env.SYSTEM_PROC_ROOT = path.join(root, 'nope');
  process.env.VCGENCMD = path.join(root, 'no-such-vcgencmd');
  const app = await startApp(require('../routes/system'));
  t.after(app.close);
  const r = await app.call('GET', '/api/system');
  assert.equal(r.status, 200);
  assert.equal(r.body.tempC, null);
  assert.equal(r.body.fanRpm, null);
  assert.equal(r.body.throttled, null);
  assert.ok(r.body.memory.totalMb > 0, 'falls back to os.totalmem');
  assert.match(stats.summary(r.body), /^The host: /);
});
