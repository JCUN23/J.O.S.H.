// Game Day: manual trigger + status. Automatic triggering lives in lib/gameDay
// (server-side watcher), so it works with no browser open and fires once per game.
const express = require('express');
const { findTeam, TEAMS } = require('../lib/teams');
const gameDay = require('../lib/gameDay');

const router = express.Router();

// POST /api/game-day { team, lightsOnly? }  ("Lions", "Detroit Lions", ...)
router.post('/api/game-day', async (req, res, next) => {
  try {
    const team = findTeam(req.body?.team);
    if (!team) return res.status(400).json({ error: `Unknown team. Try one of: ${TEAMS.map((t) => t.name).join(', ')}` });
    const entry = await gameDay.activate(team, { lightsOnly: Boolean(req.body.lightsOnly), reason: 'manual' });
    res.json({ message: `Game Day: ${entry.results.join('. ')}`, team: team.name, results: entry.results });
  } catch (err) { next(err); }
});

router.get('/api/game-day/status', (req, res) => res.json(gameDay.status()));

module.exports = router;
