// Frame TVs on the local network (lib/frameTv.js)
const express = require('express');
const frame = require('../lib/frameTv');
const activity = require('../lib/activity');

const router = express.Router();

router.get('/api/frametv', async (req, res) => {
  const tvs = await Promise.all(frame.configured().map((tv) => frame.status(tv)));
  res.json({ configured: tvs.length > 0, tvs });
});

const withTv = (handler) => async (req, res) => {
  const tv = frame.find(req.params.id);
  if (!tv) return res.status(404).json({ error: `no TV "${req.params.id}" in FRAME_TVS` });
  try { res.json(await handler(tv, req)); }
  catch (err) { res.status(err.status || 502).json({ error: err.message }); }
};

// Installed apps, so Game Day / scenes can name one (GAMEDAY_TV_APP=YouTube TV)
router.get('/api/frametv/:id/apps', withTv(async (tv, req) => frame.getApps(tv, { fresh: req.query.fresh === '1' })));

router.post('/api/frametv/:id/pair', withTv(async (tv) => {
  const paired = await frame.pair(tv);
  if (paired) activity.log({ source: 'panel', title: `Paired with ${tv.name} TV`, results: ['TV: paired'] });
  return { paired, status: await frame.status(tv) };
}));

const ACTIONS = {
  'power-on': (tv) => frame.powerOn(tv),
  'power-off': (tv) => frame.powerOff(tv),
  'art-on': async (tv) => { await frame.powerOn(tv); return frame.ensureArtMode(tv, true); },
  'art-off': async (tv) => { await frame.powerOn(tv); return frame.ensureArtMode(tv, false); },
};

router.post('/api/frametv/:id/command', withTv(async (tv, req) => {
  const { action, key } = req.body || {};
  let result;
  if (ACTIONS[action]) result = await ACTIONS[action](tv);
  else if (action === 'app' && req.body?.app) { await frame.powerOn(tv); result = `opened ${await frame.launchApp(tv, req.body.app)}`; }
  else if (action === 'mute' || action === 'unmute') result = await frame.setMute(tv, action === 'mute');
  else if (action === 'key' && frame.KEYS.includes(key)) { await frame.sendKey(tv, key); result = key; }
  else throw Object.assign(new Error(`unknown command ${action}${key ? ` ${key}` : ''}`), { status: 400 });
  return { ok: true, result, status: await frame.status(tv) };
}));

module.exports = router;
