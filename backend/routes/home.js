// Presence, printer and notifications (lib/presence.js, lib/bambu.js, lib/notify.js)
const express = require('express');
const presence = require('../lib/presence');
const bambu = require('../lib/bambu');
const notify = require('../lib/notify');

const router = express.Router();

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

module.exports = router;
