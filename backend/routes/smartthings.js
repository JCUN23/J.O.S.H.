// SmartThings OAuth + device API (Frame TVs)
const express = require('express');
const axios = require('axios');
const { FRONTEND_URL } = require('../lib/config');
const { SMARTTHINGS_CLIENT_ID, SMARTTHINGS_CLIENT_SECRET, SMARTTHINGS_PAT, SMARTTHINGS_BASE_URL, stState, getSmartThingsToken } = require('../lib/smartthings');

const router = express.Router();

// ===== SMARTTHINGS OAUTH ROUTES =====

// Start OAuth flow
router.get('/auth/smartthings', (req, res) => {
  if (!SMARTTHINGS_CLIENT_ID) {
    return res.status(500).json({ error: 'SmartThings client ID not configured' });
  }

  const scopes = 'r:devices:* x:devices:* r:scenes:* x:scenes:*';

  const authUrl = `https://auth-global.api.smartthings.com/oauth/authorize?${new URLSearchParams({
    client_id: SMARTTHINGS_CLIENT_ID,
    redirect_uri: FRONTEND_URL,
    response_type: 'code',
    scope: scopes,
    state: 'smartthings_auth'
  })}`;

  res.redirect(authUrl);
});

// Exchange code for token
router.post('/auth/smartthings/token', async (req, res) => {
  try {
    const { code } = req.body;

    if (!SMARTTHINGS_CLIENT_ID || !SMARTTHINGS_CLIENT_SECRET) {
      return res.status(500).json({ error: 'SmartThings OAuth not configured' });
    }

    const response = await axios.post('https://auth-global.api.smartthings.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: SMARTTHINGS_CLIENT_ID,
        client_secret: SMARTTHINGS_CLIENT_SECRET,
        code: code,
        redirect_uri: FRONTEND_URL
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Store tokens server-side
    stState.tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('SmartThings OAuth successful, tokens stored');

    res.json({
      success: true,
      expires_in: response.data.expires_in,
      scope: response.data.scope
    });
  } catch (error) {
    console.error('SmartThings token exchange error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to exchange token', details: error.response?.data });
  }
});

// Check OAuth status
router.get('/api/smartthings/auth-status', (req, res) => {
  const hasOAuth = !!(stState.tokens.access_token && stState.tokens.expires_at > Date.now());
  const hasPAT = !!SMARTTHINGS_PAT;

  res.json({
    connected: hasOAuth || hasPAT,
    method: hasOAuth ? 'oauth' : (hasPAT ? 'pat' : 'none'),
    expiresAt: stState.tokens.expires_at
  });
});

// ===== SMARTTHINGS API ROUTES =====

// Get all SmartThings devices
router.get('/api/smartthings/devices', async (req, res) => {
  try {
    const token = await getSmartThingsToken();

    if (!token) {
      return res.status(401).json({
        error: { code: 'NoToken', message: 'SmartThings not connected. Please authenticate.' },
        needsAuth: true
      });
    }

    const response = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { message: error.message };
    console.error(`SmartThings devices error [${status}]:`, JSON.stringify(errorData, null, 2));

    // If 401, clear tokens and indicate auth needed
    if (status === 401) {
      stState.tokens = { access_token: null, refresh_token: null, expires_at: null };
      return res.status(401).json({ error: errorData, needsAuth: true });
    }

    res.status(status).json({ error: errorData, httpStatus: status });
  }
});

// Get device status
router.get('/api/smartthings/devices/:deviceId/status', async (req, res) => {
  try {
    const token = await getSmartThingsToken();
    if (!token) {
      return res.status(401).json({ error: { code: 'NoToken', message: 'SmartThings not connected' }, needsAuth: true });
    }

    const { deviceId } = req.params;

    const response = await axios.get(`${SMARTTHINGS_BASE_URL}/devices/${deviceId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { message: error.message };
    console.error(`SmartThings status error [${status}]:`, JSON.stringify(errorData, null, 2));
    res.status(status).json({ error: errorData, httpStatus: status });
  }
});

// Execute device command
router.post('/api/smartthings/devices/:deviceId/commands', async (req, res) => {
  try {
    const token = await getSmartThingsToken();
    if (!token) {
      return res.status(401).json({ error: { code: 'NoToken', message: 'SmartThings not connected' }, needsAuth: true });
    }

    const { deviceId } = req.params;
    const { commands } = req.body;

    const response = await axios.post(
      `${SMARTTHINGS_BASE_URL}/devices/${deviceId}/commands`,
      { commands },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorData = error.response?.data || { message: error.message };
    console.error(`SmartThings command error [${status}]:`, JSON.stringify(errorData, null, 2));
    res.status(status).json({ error: errorData, httpStatus: status });
  }
});

module.exports = router;
