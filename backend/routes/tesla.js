// Tesla (parked: Fleet API needs a public domain)
const express = require('express');
const axios = require('axios');

const router = express.Router();

// ============================================
// Tesla API
// ============================================
const tesla = require('teslajs');

// Store tokens in memory (in production, use a database)
let teslaTokens = {};
// Tesla Fleet API rejects tailnet/reverse-proxy domains, so Tesla keeps its own
// redirect (must match the Tesla portal exactly, in both authorize + token calls).
const TESLA_REDIRECT_URI = process.env.TESLA_REDIRECT_URI || 'http://localhost:5173';

router.get('/auth/tesla', (req, res) => {
  // Tesla uses OAuth 2.0 - redirect to login
  const clientId = process.env.TESLA_CLIENT_ID;
  const redirectUri = encodeURIComponent(TESLA_REDIRECT_URI);
  const scopes = 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds';

  const authUrl = `https://auth.tesla.com/oauth2/v3/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=tesla_auth`;

  res.redirect(authUrl);
});

router.post('/auth/tesla/token', async (req, res) => {
  try {
    const { code } = req.body;

    const tokenResponse = await axios.post('https://auth.tesla.com/oauth2/v3/token', {
      grant_type: 'authorization_code',
      client_id: process.env.TESLA_CLIENT_ID,
      client_secret: process.env.TESLA_CLIENT_SECRET,
      code: code,
      redirect_uri: TESLA_REDIRECT_URI
    });

    teslaTokens = tokenResponse.data;
    res.json({ access_token: tokenResponse.data.access_token });
  } catch (error) {
    console.error('Tesla token exchange error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

router.get('/api/tesla/vehicle', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Get vehicle list
    const vehicles = await tesla.vehiclesAsync({ authToken: token });

    if (!vehicles || vehicles.length === 0) {
      return res.json({ error: 'No vehicles found' });
    }

    // Get data for first vehicle
    const vehicle = vehicles[0];
    const vehicleData = await tesla.vehicleDataAsync({ authToken: token, vehicleID: vehicle.id_s });

    res.json(vehicleData);
  } catch (error) {
    console.error('Tesla vehicle data error:', error);
    res.status(500).json({ error: 'Failed to fetch vehicle data' });
  }
});

router.post('/api/tesla/command', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { command, value } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Get vehicle list
    const vehicles = await tesla.vehiclesAsync({ authToken: token });
    if (!vehicles || vehicles.length === 0) {
      return res.status(404).json({ error: 'No vehicles found' });
    }

    const vehicle = vehicles[0];
    const options = { authToken: token, vehicleID: vehicle.id_s };

    let result;
    switch (command) {
      case 'lock':
        result = await tesla.doorLockAsync(options);
        break;
      case 'unlock':
        result = await tesla.doorUnlockAsync(options);
        break;
      case 'climate':
        result = value
          ? await tesla.climateStartAsync(options)
          : await tesla.climateStopAsync(options);
        break;
      case 'start_charge':
        result = await tesla.chargeStartAsync(options);
        break;
      case 'stop_charge':
        result = await tesla.chargeStopAsync(options);
        break;
      case 'honk':
        result = await tesla.honkHornAsync(options);
        break;
      default:
        return res.status(400).json({ error: 'Unknown command' });
    }

    res.json({ success: true, result });
  } catch (error) {
    console.error('Tesla command error:', error);
    res.status(500).json({ error: 'Command failed' });
  }
});

module.exports = router;
