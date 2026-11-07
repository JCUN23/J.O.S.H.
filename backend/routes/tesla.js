// Tesla via the Fleet API, called directly with axios.
// (Replaces `teslajs`, which targeted the deprecated Owner API and pulled in the
// deprecated `request` library: the source of our remaining critical audit findings.)
//
// Still parked in practice: Fleet API partner registration needs a public domain
// hosting your public key, and newer cars need signed commands (Tesla's vehicle
// command proxy) for most actions. The plumbing below is ready for that day.
const express = require('express');
const axios = require('axios');
const store = require('../lib/tokenStore');
const { getValidToken, toStored } = require('../lib/oauth');

const router = express.Router();

const AUTH_BASE = 'https://auth.tesla.com/oauth2/v3';
const TOKEN_URL = 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token';
// Regional Fleet API host (North America default). Also the OAuth `audience`.
const FLEET_BASE = process.env.TESLA_FLEET_API_BASE || 'https://fleet-api.prd.na.vn.cloud.tesla.com';
// Tesla rejects tailnet/reverse-proxy domains, so Tesla keeps its own redirect
// (must match the Tesla portal exactly, in both authorize + token calls).
const TESLA_REDIRECT_URI = process.env.TESLA_REDIRECT_URI || 'http://localhost:5173';

const form = (params) => [new URLSearchParams(params), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }];

const refreshTesla = async (refresh_token) => (await axios.post(TOKEN_URL, ...form({
  grant_type: 'refresh_token',
  client_id: process.env.TESLA_CLIENT_ID,
  refresh_token,
}))).data;

// Server-held login first (any device), then a token the browser sent (legacy).
async function resolveToken(req) {
  const stored = await getValidToken('tesla', refreshTesla).catch(() => null);
  return stored?.access_token || req.headers.authorization?.replace('Bearer ', '') || null;
}

// Fleet API responses are wrapped: { response: ... }
async function fleet(token, method, path) {
  const { data } = await axios({
    method,
    url: `${FLEET_BASE}/api/1${path}`,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return data.response;
}

const firstVehicle = async (token) => (await fleet(token, 'get', '/vehicles'))?.[0] || null;
// Path tag for a vehicle. Never the numeric `id`: it can exceed 2^53, and JSON.parse
// would silently round it to a different car. VIN (or the string id) is exact.
const tagOf = (v) => v.vin || v.id_s;

// Our command names -> Fleet API command endpoints
const COMMANDS = {
  lock: () => 'door_lock',
  unlock: () => 'door_unlock',
  climate: (value) => (value ? 'auto_conditioning_start' : 'auto_conditioning_stop'),
  start_charge: () => 'charge_start',
  stop_charge: () => 'charge_stop',
  honk: () => 'honk_horn',
};

// Set up = a real developer app (not the .env.example placeholders).
const { isPlaceholder } = require('../lib/env');
const teslaConfigured = () => Boolean(process.env.TESLA_CLIENT_ID && process.env.TESLA_CLIENT_SECRET
  && !isPlaceholder(process.env.TESLA_CLIENT_ID) && !isPlaceholder(process.env.TESLA_CLIENT_SECRET));

router.get('/api/tesla/status', (req, res) => {
  res.json({ configured: teslaConfigured(), connected: teslaConfigured() && store.isConnected('tesla') });
});

router.get('/auth/tesla', (req, res) => {
  if (!teslaConfigured()) {
    return res.status(503).type('text/plain').send("Tesla isn't set up: TESLA_CLIENT_ID / TESLA_CLIENT_SECRET in backend/.env are missing or still the example placeholders. It needs a Tesla developer app (developer.tesla.com).");
  }
  const params = new URLSearchParams({
    client_id: process.env.TESLA_CLIENT_ID,
    redirect_uri: TESLA_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
    state: 'tesla_auth',
  });
  res.redirect(`${AUTH_BASE}/authorize?${params}`);
});

router.post('/auth/tesla/token', async (req, res) => {
  try {
    const { code } = req.body;
    const { data } = await axios.post(TOKEN_URL, ...form({
      grant_type: 'authorization_code',
      client_id: process.env.TESLA_CLIENT_ID,
      client_secret: process.env.TESLA_CLIENT_SECRET,
      code,
      audience: FLEET_BASE,
      redirect_uri: TESLA_REDIRECT_URI,
    }));
    store.set('tesla', toStored(data));
    res.json({ access_token: data.access_token });
  } catch (error) {
    console.error('Tesla token exchange error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

router.get('/api/tesla/vehicle', async (req, res) => {
  try {
    const token = await resolveToken(req);
    if (!token) return res.status(401).json({ error: 'Tesla not connected' });

    const vehicle = await firstVehicle(token);
    if (!vehicle) return res.json({ error: 'No vehicles found' });

    res.json(await fleet(token, 'get', `/vehicles/${tagOf(vehicle)}/vehicle_data`));
  } catch (error) {
    const status = error.response?.status;
    console.error('Tesla vehicle data error:', status, error.response?.data || error.message);
    // 408 = car asleep; surface it so the widget can say so instead of "failed"
    res.status(status === 401 ? 401 : status === 408 ? 408 : 502).json({
      error: status === 408 ? 'Vehicle is asleep' : 'Failed to fetch vehicle data',
    });
  }
});

router.post('/api/tesla/command', async (req, res) => {
  try {
    const { command, value } = req.body || {};
    if (!COMMANDS[command]) return res.status(400).json({ error: 'Unknown command' });

    const token = await resolveToken(req);
    if (!token) return res.status(401).json({ error: 'Tesla not connected' });

    const vehicle = await firstVehicle(token);
    if (!vehicle) return res.status(404).json({ error: 'No vehicles found' });

    const result = await fleet(token, 'post', `/vehicles/${tagOf(vehicle)}/command/${COMMANDS[command](value)}`);
    // Fleet API reports command failures in-band: { result: false, reason }
    if (result && result.result === false) {
      return res.status(409).json({ success: false, error: result.reason || 'Vehicle rejected the command', result });
    }
    res.json({ success: true, result });
  } catch (error) {
    const status = error.response?.status;
    console.error('Tesla command error:', status, error.response?.data || error.message);
    res.status(status === 401 ? 401 : status === 408 ? 408 : 502).json({ error: 'Command failed' });
  }
});

module.exports = router;
