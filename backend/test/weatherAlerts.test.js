// Weather heads-up: rain/snow soon, freeze tonight, said once per event.
process.env.TZ = 'America/Detroit';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tempStores } = require('./helpers');

const dir = tempStores();
process.env.WEATHER_ALERTS_STORE_PATH = path.join(dir, 'weather-alerts.json');
Object.assign(process.env, { HOME_LAT: '1', HOME_LON: '2' });
const wx = require('../lib/weatherAlerts');

// 48 hourly slots from midnight Nov 9; caller sets what each hour looks like
const pad = (n) => String(n).padStart(2, '0');
function forecast(hourFn) {
  const time = [], prob = [], code = [], temp = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(2026, 10, 9, i);
    time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`);
    const [p, c, t] = hourFn(d);
    prob.push(p); code.push(c); temp.push(t);
  }
  return { hourly: { time, precipitation_probability: prob, weather_code: code, temperature_2m: temp } };
}
const fetchFor = (fc) => async () => ({ ok: true, json: async () => fc });
const at = (h, m = 0) => new Date(2026, 10, 9, h, m);

const rainAt4 = forecast((d) => (d.getDate() === 9 && d.getHours() >= 16 && d.getHours() < 19 ? [80, 61, 45] : [10, 3, 45]));
const snowTonight = forecast((d) => [d.getDate() === 9 && d.getHours() === 22 ? 70 : 5, d.getDate() === 9 && d.getHours() === 22 ? 73 : 3, d.getHours() < 9 || d.getHours() > 20 ? 27 : 36]);

test('analyze: first likely rain hour, tonight\'s low, the briefing line', () => {
  const a = wx.analyze(rainAt4, at(8));
  assert.equal(a.precip.kind, 'rain');
  assert.equal(a.precip.at.getHours(), 16);
  assert.equal(a.freeze, null);
  assert.equal(wx.headsUpLine(a, at(8)), 'Heads up: Rain likely from about 4 PM.');
  const s = wx.analyze(snowTonight, at(17));
  assert.equal(s.precip.kind, 'snow');
  assert.deepEqual(s.freeze, { low: 27 });
  assert.equal(wx.headsUpLine(s, at(17)), 'Heads up: Snow likely from about 10 PM; freezing tonight, down to 27.');
  assert.equal(wx.headsUpLine(wx.analyze(forecast(() => [5, 1, 50]), at(8)), at(8)), '');
});

test('proactive: rain within 90 minutes said once; not hours early', async () => {
  wx._reset();
  const said = [];
  const say = async (t) => said.push(t);
  assert.deepEqual(await wx.tick(at(9), { fetchImpl: fetchFor(rainAt4), say }), [], '7 hours early: briefing only');
  assert.deepEqual(await wx.tick(at(15), { fetchImpl: fetchFor(rainAt4), say }), ["Heads up: rain starting around 4 PM. Grab an umbrella if you're heading out."]);
  assert.deepEqual(await wx.tick(at(15, 30), { fetchImpl: fetchFor(rainAt4), say }), [], 'once');
});

test('freeze tonight: one evening alert; off switch', async () => {
  wx._reset();
  const say = async () => {};
  const r = await wx.tick(at(17), { fetchImpl: fetchFor(snowTonight), say });
  assert.ok(r.includes('Freezing tonight, down to 27 degrees.'), r.join(' | '));
  assert.deepEqual(await wx.tick(at(18), { fetchImpl: fetchFor(snowTonight), say }).then((x) => x.filter((t) => /Freezing/.test(t))), []);
  wx._reset();
  process.env.WEATHER_ALERTS = 'off';
  assert.deepEqual(await wx.tick(at(17), { fetchImpl: fetchFor(snowTonight), say }), []);
  delete process.env.WEATHER_ALERTS;
});
