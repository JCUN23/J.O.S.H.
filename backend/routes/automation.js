// Scenes, rules and the activity log.
const express = require('express');
const scenes = require('../lib/scenes');
const rules = require('../lib/rules');
const activity = require('../lib/activity');

const router = express.Router();

router.get('/api/scenes', (req, res) => res.json({ scenes: scenes.list() }));

router.post('/api/scenes/:id/activate', async (req, res, next) => {
  try {
    const scene = scenes.find(req.params.id);
    if (!scene) return res.status(404).json({ error: `No scene "${req.params.id}"` });
    res.json(await scenes.activate(scene, { source: 'panel' }));
  } catch (err) { next(err); }
});

const ruleView = (r) => ({ ...r, when: rules.describeTrigger(r) });
router.get('/api/rules', (req, res) => res.json({ rules: rules.list().map(ruleView) }));

router.patch('/api/rules/:id', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'body must be { enabled: true|false }' });
  const rule = rules.setEnabled(req.params.id, req.body.enabled);
  if (!rule) return res.status(404).json({ error: `No rule "${req.params.id}"` });
  activity.log({ source: 'panel', title: `Rule ${rule.enabled ? 'enabled' : 'disabled'}: ${rule.name}` });
  res.json({ rule: ruleView(rule) });
});

// Run a rule's action right now (to test it), regardless of its trigger
router.post('/api/rules/:id/run', async (req, res, next) => {
  try {
    const rule = rules.get(req.params.id);
    if (!rule) return res.status(404).json({ error: `No rule "${req.params.id}"` });
    res.json(await rules.fire(rule, { source: 'panel', reason: `Ran "${rule.name}" manually` }));
  } catch (err) { next(err); }
});

router.get('/api/activity', (req, res) => {
  res.json({ entries: activity.list(parseInt(req.query.limit, 10) || 50) });
});

module.exports = router;
