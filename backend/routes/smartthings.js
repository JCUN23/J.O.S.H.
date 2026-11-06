// SmartThings OAuth + device API (Frame TVs)
const express = require('express');
const axios = require('axios');
const { FRONTEND_URL } = require('../lib/config');
const { SMARTTHINGS_CLIENT_ID, SMARTTHINGS_CLIENT_SECRET, SMARTTHINGS_PAT, SMARTTHINGS_BASE_URL, stState, getSmartThingsToken, tokenRequest } = require('../lib/smartthings');
const { toStored } = require('../lib/oauth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// ===== SMARTTHINGS OAUTH ROUTES =====

// Start OAuth flow
router.get('/auth/smartthings', (req, res) => {
  if (!SMARTTHINGS_CLIENT_ID) {
    return res.status(500).json({ error: 'SmartThings client ID not configured' });
  }

  // Must be a subset of the scopes registered on the OAuth-In app, or authorize fails.
  // Scenes scopes were dropped: nothing uses them and many apps don't register them.
  const scopes = process.env.SMARTTHINGS_SCOPES || 'r:devices:* x:devices:*';

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

    const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: FRONTEND_URL });

    // Stored server-side (survives restarts, shared by every device)
    stState.tokens = toStored(data);

    console.log('SmartThings OAuth successful, tokens stored');

    res.json({
      success: true,
      expires_in: data.expires_in,
      scope: data.scope
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

// What each Samsung TV actually supports (capabilities, disabled ones, model, current
// status). Frame support varies by model year, so TV controls are built from this
// rather than guessed. Also written to data/frame-report.json (no tokens in it).
router.get('/api/smartthings/frame-report', async (req, res) => {
  try {
    const token = await getSmartThingsToken();
    if (!token) return res.status(401).json({ error: 'SmartThings not connected', needsAuth: true });
    const headers = { Authorization: `Bearer ${token}` };
    const { data } = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, { headers });
    const isTv = (d) => /frame|tv/i.test(d.label || '') ||
      (d.components || []).some((c) => (c.capabilities || []).some((cap) => cap.id.startsWith('samsungvd.')));
    const tvs = [];
    for (const d of (data.items || []).filter(isTv)) {
      let status = null;
      try { status = (await axios.get(`${SMARTTHINGS_BASE_URL}/devices/${d.deviceId}/status`, { headers })).data; }
      catch (err) { status = { error: err.response?.status || err.message }; }
      const main = status?.components?.main || {};
      tvs.push({
        label: d.label, deviceId: d.deviceId, name: d.name,
        manufacturer: d.manufacturerName, model: d.ocf?.modelNumber || null,
        deviceType: d.deviceTypeName || d.type, presentationId: d.presentationId,
        components: (d.components || []).map((c) => ({ id: c.id, capabilities: (c.capabilities || []).map((x) => x.id) })),
        disabledCapabilities: main['custom.disabledCapabilities']?.disabledCapabilities?.value || [],
        status: status?.error ? status : Object.fromEntries(Object.entries(main)
          .filter(([k]) => /switch|ambient|art|mediaInputSource|audioVolume|tvChannel|picture/i.test(k))),
      });
    }
    const report = { generatedAt: new Date().toISOString(), count: tvs.length, tvs };
    try {
      const file = path.join(__dirname, '..', 'data', 'frame-report.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(report, null, 2), { mode: 0o600 });
    } catch (err) { console.warn('frame-report not saved:', err.message); }
    res.json(report);
  } catch (error) {
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data || error.message, needsAuth: status === 401 });
  }
});

module.exports = router;
