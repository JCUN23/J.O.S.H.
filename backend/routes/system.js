// Host diagnostics for the System widget and Alfred (lib/systemStats.js)
const express = require('express');
const { snapshot } = require('../lib/systemStats');

const router = express.Router();
router.get('/api/system', async (req, res, next) => {
  try { res.json(await snapshot()); } catch (err) { next(err); }
});
module.exports = router;
