// Presence, printer and notifications (lib/presence.js, lib/bambu.js, lib/notify.js)
const express = require('express');
const presence = require('../lib/presence');
const bambu = require('../lib/bambu');
const notify = require('../lib/notify');

const router = express.Router();

// Running timers/reminders (the Sentinel bar's countdown chips) and cancelling them.
router.get('/api/timers', (req, res) => res.json({ items: require('../lib/timers').list(), now: Date.now() }));
router.post('/api/timers/cancel', (req, res) => res.json({ result: require('../lib/timers').cancel(req.body?.label) }));

// The panel saw Josh after its idle screen: maybe a morning briefing or a welcome home.
router.post('/api/briefing/arrived', async (req, res) => res.json(await require('../lib/briefing').onArrived()));

// Home location for the weather widget, from .env (HOME_LAT/HOME_LON): kept out of the
// public repo. Only reachable on the tailnet, like the rest of the panel.
router.get('/api/home/location', (req, res) => {
  const lat = Number(process.env.HOME_LAT), lon = Number(process.env.HOME_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(404).json({ error: 'Set HOME_LAT and HOME_LON in backend/.env' });
  res.json({ lat, lon });
});

router.get('/api/presence', (req, res) => {
  const people = presence.snapshot();
  res.json({ configured: people.length > 0, anyoneHome: presence.anyoneHome(), people });
});

// Setup helper: the exact Tailscale machine names to put in PRESENCE_DEVICES.
router.get('/api/presence/peers', async (req, res) => res.json(await presence.peers()));

router.get('/api/printer', (req, res) => res.json(bambu.snapshot()));

router.get('/api/notify', (req, res) => res.json({
  configured: notify.configured(),
  server: (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, ''),
  muted: (process.env.NTFY_MUTE || '').split(',').map((s) => s.trim()).filter(Boolean),
  categories: notify.CATEGORIES,
}));

router.post('/api/notify/test', async (req, res) => {
  const r = await notify.notify({ title: 'Sentinel test notification', message: 'If you can read this, alerts work.', category: 'test', tags: ['bat'] });
  res.status(r.sent ? 200 : 502).json(r);
});

// All lights on/off (the panel's "turn off the lights" shortcut). Govee + Hue through
// lib/devices, which knows Govee's quirks: in-band errors, power-only models, rate limits.
// (Nov 9: the old browser-side shortcut sent Govee commands blind, never touched Hue,
// and said "Going dark" with every light still on.)
router.post('/api/lights', async (req, res) => {
  const on = req.body?.on !== false;
  const devices = require('../lib/devices');
  const results = (await Promise.allSettled([devices.goveeApply({ on }), devices.hueApply({ on })]))
    .map((r) => (r.status === 'fulfilled' ? r.value : `error: ${r.reason?.response?.data?.message || r.reason?.message}`));
  const ok = results.filter((r) => !/not configured/.test(r));
  const failed = ok.filter((r) => /fail|error/i.test(r) || /: 0\//.test(r));
  require('../lib/activity').log({ source: 'voice', title: `Lights ${on ? 'on' : 'off'}`, results });
  res.json({ ok: ok.length > 0 && failed.length === 0, results, failed });
});

module.exports = router;
