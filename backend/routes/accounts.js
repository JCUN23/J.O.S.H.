// GET /auth/status: which providers have a server-stored login. Booleans only.
const express = require('express');
const store = require('../lib/tokenStore');

const router = express.Router();
const PROVIDERS = ['google', 'microsoft', 'spotify', 'smartthings', 'tesla'];

router.get('/auth/status', (req, res) => {
  res.json(Object.fromEntries(PROVIDERS.map((p) => [p, store.isConnected(p)])));
});

module.exports = router;
