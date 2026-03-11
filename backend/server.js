const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();
const axios = require('axios');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json());

const GOVEE_API_KEY = process.env.GOVEE_API_KEY;
const GOVEE_BASE_URL = 'https://developer-api.govee.com/v1';

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:5173";

const CREALITY_API_BASE = 'https://api.creality.com';
let crealityToken = null;

// Google Calendar OAuth
app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ].join(' ');

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: FRONTEND_URL,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    state: 'google_calendar'
  })}`;

  res.redirect(authUrl);
});

app.post('/auth/google/token', async (req, res) => {
  try {
    const { code } = req.body;

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: FRONTEND_URL,
      grant_type: 'authorization_code'
    });

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Google token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

app.post('/auth/google/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    });

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Google token refresh error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Microsoft/Outlook Calendar OAuth
app.get('/auth/microsoft', (req, res) => {
  const scopes = [
    'Calendars.Read',
    'User.Read'
  ].join(' ');

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: `${FRONTEND_URL}/callback/microsoft`,
    scope: scopes,
    response_mode: 'query'
  })}`;

  res.redirect(authUrl);
});

app.post('/auth/microsoft/token', async (req, res) => {
  try {
    const { code } = req.body;

    const tokenResponse = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: `${FRONTEND_URL}/callback/microsoft`,
        grant_type: 'authorization_code'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Microsoft token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

app.post('/auth/microsoft/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    const tokenResponse = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        refresh_token,
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        grant_type: 'refresh_token'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Microsoft token refresh error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Philips Hue Configuration
const HUE_BRIDGE_IP = process.env.HUE_BRIDGE_IP;
const HUE_USERNAME = process.env.HUE_USERNAME;

// ===== PHILIPS HUE API ROUTES =====

// Get all lights
app.get('/api/hue/lights', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured. Add HUE_BRIDGE_IP and HUE_USERNAME to .env' });
    }

    const response = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
    res.json(response.data);
  } catch (error) {
    console.error('Hue lights error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Control a light
app.put('/api/hue/lights/:id', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const { id } = req.params;
    const { state } = req.body;

    const response = await axios.put(
      `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${id}/state`,
      state
    );

    res.json(response.data);
  } catch (error) {
    console.error('Hue control error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get all groups/rooms
app.get('/api/hue/groups', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const response = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups`);
    res.json(response.data);
  } catch (error) {
    console.error('Hue groups error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Control a group/room
app.put('/api/hue/groups/:id', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const { id } = req.params;
    const { action } = req.body;

    const response = await axios.put(
      `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/${id}/action`,
      action
    );

    res.json(response.data);
  } catch (error) {
    console.error('Hue group control error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get all scenes
app.get('/api/hue/scenes', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const response = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/scenes`);
    res.json(response.data);
  } catch (error) {
    console.error('Hue scenes error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Activate a scene
app.put('/api/hue/groups/:groupId/scene/:sceneId', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const { groupId, sceneId } = req.params;

    const response = await axios.put(
      `http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups/${groupId}/action`,
      { scene: sceneId }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Hue scene activation error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// ============================================
// Tesla API
// ============================================
const tesla = require('teslajs');

// Store tokens in memory (in production, use a database)
let teslaTokens = {};

app.get('/auth/tesla', (req, res) => {
  // Tesla uses OAuth 2.0 - redirect to login
  const clientId = process.env.TESLA_CLIENT_ID;
  const redirectUri = encodeURIComponent(FRONTEND_URL);
  const scopes = 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds';

  const authUrl = `https://auth.tesla.com/oauth2/v3/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${redirectUri}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=tesla_auth`;

  res.redirect(authUrl);
});

app.post('/auth/tesla/token', async (req, res) => {
  try {
    const { code } = req.body;

    const tokenResponse = await axios.post('https://auth.tesla.com/oauth2/v3/token', {
      grant_type: 'authorization_code',
      client_id: process.env.TESLA_CLIENT_ID,
      client_secret: process.env.TESLA_CLIENT_SECRET,
      code: code,
      redirect_uri: FRONTEND_URL
    });

    teslaTokens = tokenResponse.data;
    res.json({ access_token: tokenResponse.data.access_token });
  } catch (error) {
    console.error('Tesla token exchange error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});

app.get('/api/tesla/vehicle', async (req, res) => {
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

app.post('/api/tesla/command', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Backend server running on http://127.0.0.1:5173:${PORT}`);
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
    });

    res.json(message);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sentinel AI endpoint with tool use
app.post('/api/sentinel', async (req, res) => {
  try {
    const { message, systemPrompt, tools, toolResults, previousAssistantMessage } = req.body;

    // Build messages array
    const messages = [];

    // If we have tool results, we need to include the previous exchange
    if (toolResults && previousAssistantMessage) {
      messages.push({ role: 'user', content: message });
      messages.push({ role: 'assistant', content: previousAssistantMessage });
      messages.push({ role: 'user', content: toolResults });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const requestParams = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: messages,
    };

    // Add tools if provided and not processing tool results
    if (tools && !toolResults) {
      requestParams.tools = tools;
    }

    const response = await anthropic.messages.create(requestParams);

    // Extract text and tool calls from response
    const textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('');
    const toolCalls = response.content.filter(c => c.type === 'tool_use').map(c => ({
      id: c.id,
      name: c.name,
      input: c.input
    }));

    res.json({
      text: textContent,
      toolCalls: toolCalls,
      stopReason: response.stop_reason,
      fullContent: response.content
    });
  } catch (error) {
    console.error('Sentinel error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stoic", async (req, res) => {
  const r = await fetch("https://stoic.tekloon.net/stoic-quote");
  const data = await r.json();
  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Backend running on http://127.0.0.1:5173:${PORT}`);
});

// Get all Govee devices
app.get('/api/govee/devices', async (req, res) => {
  try {
    const response = await axios.get(`${GOVEE_BASE_URL}/devices`, {
      headers: {
        'Govee-API-Key': GOVEE_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Govee API error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Control Govee device
app.post('/api/govee/control', async (req, res) => {
  try {
    const { device, model, cmd } = req.body;

    const response = await axios.put(
      `${GOVEE_BASE_URL}/devices/control`,
      {
        device: device,
        model: model,
        cmd: cmd
      },
      {
        headers: {
          'Govee-API-Key': GOVEE_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Govee control error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get device state
app.get('/api/govee/state/:device/:model', async (req, res) => {
  try {
    const { device, model } = req.params;

    const response = await axios.get(
      `${GOVEE_BASE_URL}/devices/state?device=${device}&model=${model}`,
      {
        headers: {
          'Govee-API-Key': GOVEE_API_KEY
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Govee state error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Login to Creality Cloud
app.post('/api/creality/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.post(
      `${CREALITY_API_BASE}/api/user/login`,
      {
        email: email,
        password: password
      }
    );

    crealityToken = response.data.data.token;

    res.json({
      success: true,
      token: crealityToken
    });
  } catch (error) {
    console.error('Creality login error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get printer list
app.get('/api/creality/printers', async (req, res) => {
  try {
    if (!crealityToken) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const response = await axios.get(
      `${CREALITY_API_BASE}/api/device/list`,
      {
        headers: {
          'Authorization': `Bearer ${crealityToken}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Creality printers error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Get printer status
app.get('/api/creality/status/:deviceId', async (req, res) => {
  try {
    if (!crealityToken) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const { deviceId } = req.params;

    const response = await axios.get(
      `${CREALITY_API_BASE}/api/device/status/${deviceId}`,
      {
        headers: {
          'Authorization': `Bearer ${crealityToken}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Creality status error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Add this to your backend/server.js

// Proxy for Creality printer (avoids CORS)
app.get('/api/printer/status', async (req, res) => {
  try {
    const printerIP = req.query.ip;

    if (!printerIP) {
      return res.status(400).json({ error: 'Printer IP required' });
    }

    // Try multiple possible endpoints
    const endpoints = [
      `http://${printerIP}:9999/printer/status`,
      `http://${printerIP}:9999/api/printer`,
      `http://${printerIP}:9999/status`,
      `http://${printerIP}/status`,
    ];

    for (const endpoint of endpoints) {
      try {
        console.log('Trying endpoint:', endpoint);
        const response = await axios.get(endpoint, { timeout: 3000 });

        if (response.data) {
          console.log('Success! Endpoint works:', endpoint);
          return res.json({
            success: true,
            data: response.data,
            endpoint: endpoint
          });
        }
      } catch (err) {
        // Try next endpoint
        continue;
      }
    }

    res.status(404).json({ error: 'Could not connect to printer on any known endpoint' });
  } catch (error) {
    console.error('Printer proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Control printer (pause/resume/cancel)
app.post('/api/creality/control/:deviceId', async (req, res) => {
  try {
    if (!crealityToken) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const { deviceId } = req.params;
    const { command } = req.body;

    const response = await axios.post(
      `${CREALITY_API_BASE}/api/device/control/${deviceId}`,
      {
        command: command
      },
      {
        headers: {
          'Authorization': `Bearer ${crealityToken}`
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Creality control error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

/* eslint-env node */
// SmartThings configuration
const SMARTTHINGS_CLIENT_ID = process.env.SMARTTHINGS_CLIENT_ID;
const SMARTTHINGS_CLIENT_SECRET = process.env.SMARTTHINGS_CLIENT_SECRET;
const SMARTTHINGS_PAT = process.env.SMARTTHINGS_TOKEN; // Legacy PAT fallback
const SMARTTHINGS_BASE_URL = 'https://api.smartthings.com/v1';

// In-memory token storage (persists until server restart)
let smartThingsTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null
};

// Helper to get valid SmartThings token
async function getSmartThingsToken() {
  // If we have OAuth tokens, use them
  if (smartThingsTokens.access_token) {
    // Check if token is expired (with 5 min buffer)
    if (smartThingsTokens.expires_at && Date.now() < smartThingsTokens.expires_at - 300000) {
      return smartThingsTokens.access_token;
    }
    // Try to refresh if we have a refresh token
    if (smartThingsTokens.refresh_token) {
      try {
        const refreshed = await refreshSmartThingsToken();
        if (refreshed) return smartThingsTokens.access_token;
      } catch (err) {
        console.error('SmartThings token refresh failed:', err);
      }
    }
  }
  // Fall back to PAT if available
  return SMARTTHINGS_PAT || null;
}

// Refresh SmartThings token
async function refreshSmartThingsToken() {
  if (!smartThingsTokens.refresh_token || !SMARTTHINGS_CLIENT_ID || !SMARTTHINGS_CLIENT_SECRET) {
    return false;
  }

  try {
    const response = await axios.post('https://auth-global.api.smartthings.com/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: SMARTTHINGS_CLIENT_ID,
        client_secret: SMARTTHINGS_CLIENT_SECRET,
        refresh_token: smartThingsTokens.refresh_token
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    smartThingsTokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token || smartThingsTokens.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };

    console.log('SmartThings token refreshed successfully');
    return true;
  } catch (error) {
    console.error('SmartThings refresh error:', error.response?.data || error.message);
    return false;
  }
}

// ===== SMARTTHINGS OAUTH ROUTES =====

// Start OAuth flow
app.get('/auth/smartthings', (req, res) => {
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
app.post('/auth/smartthings/token', async (req, res) => {
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
    smartThingsTokens = {
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
app.get('/api/smartthings/auth-status', (req, res) => {
  const hasOAuth = !!(smartThingsTokens.access_token && smartThingsTokens.expires_at > Date.now());
  const hasPAT = !!SMARTTHINGS_PAT;

  res.json({
    connected: hasOAuth || hasPAT,
    method: hasOAuth ? 'oauth' : (hasPAT ? 'pat' : 'none'),
    expiresAt: smartThingsTokens.expires_at
  });
});

// ===== SMARTTHINGS API ROUTES =====

// Get all SmartThings devices
app.get('/api/smartthings/devices', async (req, res) => {
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
      smartThingsTokens = { access_token: null, refresh_token: null, expires_at: null };
      return res.status(401).json({ error: errorData, needsAuth: true });
    }

    res.status(status).json({ error: errorData, httpStatus: status });
  }
});

// Get device status
app.get('/api/smartthings/devices/:deviceId/status', async (req, res) => {
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
app.post('/api/smartthings/devices/:deviceId/commands', async (req, res) => {
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

// ============================================
// Groq LLM for Sentinel AI
// ============================================
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Define Sentinel's available tools/capabilities
// FORMAT: OpenAI/Groq tool format. Each entry describes a function the model can call.
// The model reads these and decides WHEN to call them. Your code decides WHAT happens.
const SENTINEL_TOOLS = [
  {
    type: "function",
    function: {
      name: "control_govee_lights",
      description: "Control Govee smart lights (light strips, rope lights, lamps) - turn on/off, change color, adjust brightness",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "color", "brightness"], description: "The action to perform" },
          value: { type: "string", description: "For color: hex like #ff0000 or name (red, blue, purple, cyan, white, warm, cool). For brightness: number 0-100" },
          device: { type: "string", description: "Optional specific device name. If omitted, applies to all Govee devices" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_hue_lights",
      description: "Control Philips Hue lights (Hue Go portable lights, Hue color lamps). Devices: 'Left Go', 'Right Go', 'Hue color lamp 1/2/3'",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "color", "brightness"], description: "The action to perform" },
          value: { type: "string", description: "For color: hex like #ff0000 or name (red, blue, purple, cyan, white, warm, cool). For brightness: number 1-254" },
          device: { type: "string", description: "Optional: 'Left Go', 'Right Go', 'all', or a lamp name. If omitted, applies to all Hue lights" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_spotify",
      description: "Control Spotify music playback",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["play", "pause", "next", "previous", "volume", "search_and_play"], description: "The action to perform" },
          value: { type: "string", description: "For volume: number 0-100. For search_and_play: song name or 'song by artist'" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "control_tv",
      description: "Control Samsung Frame TV via SmartThings",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["on", "off", "art_mode_on", "art_mode_off", "mute", "volume", "hdmi"], description: "The action to perform" },
          value: { type: "string", description: "For volume: number 0-100. For hdmi: 1-4" }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Get the current time and date",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather information",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_calendar",
      description: "Get upcoming calendar events",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_sports",
      description: "Get current sports information, scores, schedules, or game updates for any team or league",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The sports question or request (e.g., 'NFL games today', 'Pistons score', 'next Lions game')" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "Get current news headlines",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "play_music",
      description: "Search for and play music on Spotify. Use for artist requests, song requests, mood requests, or genre requests. Can also set the room lights to match the album/artist colors for an immersive vibe.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to play — artist name, song title, album, genre, or mood (e.g. 'Tyler the Creator', 'chill lo-fi', 'Bohemian Rhapsody')" },
          set_lights: { type: "boolean", description: "Whether to set room lights to match the album art colors. Default true for mood/vibe requests, false for simple play requests." }
        },
        required: ["query"]
      }
    }
  }
];

// ---- Color name → RGB lookup (shared by Govee + Hue tool execution) ----
const COLOR_MAP = {
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  purple: { r: 128, g: 0, b: 255 },
  cyan: { r: 0, g: 255, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  pink: { r: 255, g: 105, b: 180 },
  white: { r: 255, g: 255, b: 255 },
  warm: { r: 255, g: 180, b: 100 },
  cool: { r: 180, g: 210, b: 255 },
};

function parseColor(value) {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  // Try hex: #rrggbb
  const hex = lower.replace('#', '');
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

// RGB → Hue bridge HSB (hue: 0-65535, sat: 0-254, bri: 0-254)
function rgbToHueBridgeHSB({ r, g, b }) {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rN) h = ((gN - bN) / delta + (gN < bN ? 6 : 0)) / 6;
    else if (max === gN) h = ((bN - rN) / delta + 2) / 6;
    else h = ((rN - gN) / delta + 4) / 6;
  }
  const s = max === 0 ? 0 : delta / max;
  return { hue: Math.round(h * 65535), sat: Math.round(s * 254), bri: Math.round(max * 254) };
}

// ---- executeTool: the switch statement that ACTUALLY does things ----
// The model says "call X with Y" — this function runs YOUR code and returns a string result.
// The model never enters this function. It only sees what you return.
async function executeTool(toolName, args, { spotifyToken } = {}) {

  // ===== GOVEE LIGHTS =====
  if (toolName === 'control_govee_lights') {
    try {
      const devicesRes = await axios.get(`${GOVEE_BASE_URL}/devices`, {
        headers: { 'Govee-API-Key': GOVEE_API_KEY }
      });
      const devices = devicesRes.data?.data?.devices || [];
      if (devices.length === 0) return 'No Govee devices found.';

      // Filter to specific device if requested
      let targets = args.device
        ? devices.filter(d => d.deviceName.toLowerCase().includes(args.device.toLowerCase()))
        : devices;
      if (targets.length === 0) return `No Govee device matching "${args.device}" found.`;

      // H6076 models are read-only (Govee API limitation) — only allow power toggle
      if (args.action !== 'on' && args.action !== 'off') {
        targets = targets.filter(d => !d.model?.toUpperCase().startsWith('H6076'));
        if (targets.length === 0) return 'All matching Govee devices are read-only and do not support color/brightness control.';
      }

      let cmd;
      if (args.action === 'on') cmd = { name: 'turn', value: 'on' };
      else if (args.action === 'off') cmd = { name: 'turn', value: 'off' };
      else if (args.action === 'brightness') cmd = { name: 'brightness', value: parseInt(args.value) || 50 };
      else if (args.action === 'color') {
        const rgb = parseColor(args.value);
        if (!rgb) return `Unknown color "${args.value}".`;
        cmd = { name: 'color', value: rgb };
      }

      await Promise.all(targets.map(d =>
        axios.put(`${GOVEE_BASE_URL}/devices/control`, {
          device: d.device, model: d.model, cmd
        }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } })
      ));

      const names = targets.map(d => d.deviceName).join(', ');
      return `Govee ${args.action} applied to: ${names}`;
    } catch (err) {
      return `Govee control failed: ${err.message}`;
    }
  }

  // ===== HUE LIGHTS =====
  if (toolName === 'control_hue_lights') {
    try {
      if (!HUE_BRIDGE_IP || !HUE_USERNAME) return 'Hue Bridge not configured.';

      // Map friendly names → bridge IDs
      const lightsRes = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
      const allLights = Object.entries(lightsRes.data).map(([id, l]) => ({ id, ...l }));

      // Filter to target
      let targets;
      if (!args.device || args.device.toLowerCase() === 'all') {
        targets = allLights;
      } else {
        targets = allLights.filter(l => l.name.toLowerCase().includes(args.device.toLowerCase()));
      }
      if (targets.length === 0) return `No Hue light matching "${args.device}" found.`;

      let state;
      if (args.action === 'on') state = { on: true };
      else if (args.action === 'off') state = { on: false };
      else if (args.action === 'brightness') state = { on: true, bri: Math.min(254, Math.max(1, parseInt(args.value) || 127)) };
      else if (args.action === 'color') {
        const rgb = parseColor(args.value);
        if (!rgb) return `Unknown color "${args.value}".`;
        state = { on: true, ...rgbToHueBridgeHSB(rgb) };
      }

      await Promise.all(targets.map(l =>
        axios.put(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${l.id}/state`, state)
      ));

      const names = targets.map(l => l.name).join(', ');
      return `Hue ${args.action} applied to: ${names}`;
    } catch (err) {
      return `Hue control failed: ${err.message}`;
    }
  }

  // ===== TIME =====
  if (toolName === 'get_time') {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
      ' on ' + now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // ===== WEATHER =====
  if (toolName === 'get_weather') {
    try {
      const lat = 42.751784, lon = -83.0058174;
      const weatherRes = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America/Detroit`
      );
      const data = weatherRes.data;
      const temp = Math.round(data.current.temperature_2m);
      const feelsLike = Math.round(data.current.apparent_temperature);
      const high = Math.round(data.daily.temperature_2m_max[0]);
      const low = Math.round(data.daily.temperature_2m_min[0]);
      const code = data.current.weather_code;
      let condition = 'clear';
      if (code === 0) condition = 'clear';
      else if (code <= 3) condition = 'partly cloudy';
      else if (code <= 48) condition = 'foggy';
      else if (code <= 67) condition = 'rainy';
      else if (code <= 77) condition = 'snowy';
      else if (code <= 82) condition = 'rainy';
      else condition = 'stormy';
      return `Currently ${temp}°F and ${condition}. Feels like ${feelsLike}°F. High of ${high}°F, low of ${low}°F.`;
    } catch { return 'Unable to get weather data.'; }
  }

  // ===== SPORTS =====
  if (toolName === 'get_sports') {
    try {
      const query = (args.query || '').toLowerCase();
      let sport = '', team = '', teamLabel = '';
      if (query.includes('nfl') || query.includes('football') || query.includes('lions')) sport = 'football/nfl';
      else if (query.includes('nba') || query.includes('basketball') || query.includes('pistons')) sport = 'basketball/nba';
      else if (query.includes('barcelona') || query.includes('barca') || query.includes('la liga') || query.includes('soccer')) sport = 'soccer/esp.1';
      if (query.includes('lions')) { team = 'det'; teamLabel = 'Lions'; }
      else if (query.includes('pistons')) { team = 'det'; teamLabel = 'Pistons'; }
      else if (query.includes('barcelona') || query.includes('barca')) { team = '83'; teamLabel = 'FC Barcelona'; }

      if (!sport) return 'I can provide info for NFL (Lions), NBA (Pistons), and La Liga (FC Barcelona) games.';

      if (query.includes('score')) {
        const espnRes = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/scoreboard`);
        const events = espnRes.data.events || [];
        if (events.length === 0) return 'No recent games found.';
        const targetEvent = team ? events.find(e => e.competitions[0].competitors.some(c => c.team.abbreviation.toLowerCase() === team)) : null;
        if (targetEvent) {
          const comp = targetEvent.competitions[0];
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          return `${away.team.shortDisplayName} ${away.score}, ${home.team.shortDisplayName} ${home.score} (${targetEvent.status.type.description})`;
        }
        return events.slice(0, 3).map(e => {
          const comp = e.competitions[0];
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          return `${away.team.shortDisplayName} ${away.score}, ${home.team.shortDisplayName} ${home.score}`;
        }).join('; ');
      }

      if (team) {
        const espnRes = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/teams/${team}`);
        if (espnRes.data.team?.nextEvent?.[0]) {
          const nextEvent = espnRes.data.team.nextEvent[0];
          const gameDate = new Date(nextEvent.date);
          return `${teamLabel} next game: ${nextEvent.shortName} on ${gameDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
        }
        return 'No upcoming games found.';
      }

      const espnRes = await axios.get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/scoreboard`);
      const events = espnRes.data.events || [];
      if (events.length === 0) return 'No games today.';
      return events.slice(0, 3).map(e => {
        const comp = e.competitions[0];
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        return `${away.team.shortDisplayName} at ${home.team.shortDisplayName} (${e.status.type.description})`;
      }).join(', ');
    } catch { return 'Unable to get sports information.'; }
  }

  // ===== PLAY MUSIC (Spotify + lights) =====
  // This is the most complex tool — it chains multiple APIs:
  //   1. Search Spotify for the query
  //   2. Start playback (artist catalog on shuffle, or specific track)
  //   3. Optionally extract dominant color from album/artist art
  //   4. Set Govee + Hue lights to that color
  if (toolName === 'play_music') {
    if (!spotifyToken) return 'Spotify is not connected. Josh needs to log in on the dashboard first.';

    const SPOTIFY_BASE = 'https://api.spotify.com/v1';
    const spotifyHeaders = { Authorization: `Bearer ${spotifyToken}` };

    try {
      // Step 1: Search — try artist first, fall back to track
      const searchRes = await axios.get(`${SPOTIFY_BASE}/search`, {
        headers: spotifyHeaders,
        params: { q: args.query, type: 'artist,track,playlist', limit: 3 }
      });

      const artists = searchRes.data.artists?.items || [];
      const tracks = searchRes.data.tracks?.items || [];
      const playlists = searchRes.data.playlists?.items || [];

      let playBody = {};     // What to send to /me/player/play
      let imageUrl = null;   // Album/artist art for color extraction
      let description = '';  // What we'll tell the model we did

      if (artists.length > 0 && artists[0].name.toLowerCase().includes(args.query.toLowerCase().split(' ')[0])) {
        // Artist match — play their full catalog on shuffle (the "mood" behavior)
        const artist = artists[0];
        playBody = { context_uri: artist.uri };
        imageUrl = artist.images?.[0]?.url;
        description = `Playing ${artist.name} on shuffle.`;
      } else if (tracks.length > 0) {
        // Track match — play that specific track
        const track = tracks[0];
        playBody = { uris: [track.uri] };
        imageUrl = track.album?.images?.[0]?.url;
        description = `Playing "${track.name}" by ${track.artists[0].name}.`;
      } else if (playlists.length > 0) {
        // Playlist match — good for mood/genre queries like "chill lo-fi"
        const playlist = playlists[0];
        playBody = { context_uri: playlist.uri };
        imageUrl = playlist.images?.[0]?.url;
        description = `Playing playlist "${playlist.name}".`;
      } else {
        return `Couldn't find anything on Spotify for "${args.query}".`;
      }

      // Step 2: Start playback
      try {
        await axios.put(`${SPOTIFY_BASE}/me/player/play`, playBody, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
      } catch (playErr) {
        // 404 = no active device. Try to find one and transfer playback.
        if (playErr.response?.status === 404 || playErr.response?.status === 403) {
          const devicesRes = await axios.get(`${SPOTIFY_BASE}/me/player/devices`, { headers: spotifyHeaders });
          const devices = devicesRes.data.devices || [];
          if (devices.length === 0) return `${description} But no Spotify device is available — open Spotify on a device first.`;
          // Transfer to the first available device
          await axios.put(`${SPOTIFY_BASE}/me/player`, {
            device_ids: [devices[0].id], play: true
          }, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
          // Retry play
          await axios.put(`${SPOTIFY_BASE}/me/player/play`, playBody, { headers: { ...spotifyHeaders, 'Content-Type': 'application/json' } });
        } else {
          return `${description} But playback failed: ${playErr.message}`;
        }
      }

      // Enable shuffle for artist context (mood behavior)
      if (playBody.context_uri?.startsWith('spotify:artist:')) {
        try {
          await axios.put(`${SPOTIFY_BASE}/me/player/shuffle?state=true`, null, { headers: spotifyHeaders });
        } catch { /* shuffle is nice-to-have, not critical */ }
      }

      // Step 3: Extract dominant color from album/artist art
      if (args.set_lights !== false && imageUrl) {
        try {
          // Download the image and resize to 1x1 pixel to get average color.
          // sharp handles this efficiently — no heavy image processing.
          const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 5000 });
          const { data: [r, g, b] } = await sharp(Buffer.from(imgResponse.data))
            .resize(1, 1)
            .raw()
            .toBuffer({ resolveWithObject: true });

          // Step 4: Set lights to the extracted color
          const lightResults = [];

          // Govee
          try {
            const devicesRes = await axios.get(`${GOVEE_BASE_URL}/devices`, { headers: { 'Govee-API-Key': GOVEE_API_KEY } });
            const devices = (devicesRes.data?.data?.devices || [])
              .filter(d => !d.model?.toUpperCase().startsWith('H6076')); // skip read-only
            if (devices.length > 0) {
              await Promise.all(devices.map(d =>
                axios.put(`${GOVEE_BASE_URL}/devices/control`, {
                  device: d.device, model: d.model,
                  cmd: { name: 'color', value: { r, g, b } }
                }, { headers: { 'Govee-API-Key': GOVEE_API_KEY, 'Content-Type': 'application/json' } })
              ));
              lightResults.push('Govee');
            }
          } catch { /* non-critical */ }

          // Hue
          try {
            if (HUE_BRIDGE_IP && HUE_USERNAME) {
              const hsb = rgbToHueBridgeHSB({ r, g, b });
              const lightsRes = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
              const hueIds = Object.keys(lightsRes.data);
              await Promise.all(hueIds.map(id =>
                axios.put(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights/${id}/state`, { on: true, ...hsb })
              ));
              lightResults.push('Hue');
            }
          } catch { /* non-critical */ }

          if (lightResults.length > 0) {
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            description += ` Lights set to ${hexColor} (${lightResults.join(' + ')}).`;
          }
        } catch (colorErr) {
          description += ' Could not extract art color for lights.';
        }
      }

      return description;
    } catch (err) {
      return `Spotify search failed: ${err.message}`;
    }
  }

  // ===== STUBS (not yet wired server-side) =====
  if (toolName === 'control_spotify') return 'Use the play_music tool instead for music requests. For basic playback control (pause/skip), action noted: ' + args.action;
  if (toolName === 'control_tv') return 'TV control not yet wired server-side. Action noted: ' + args.action;
  if (toolName === 'get_news') return 'News headlines not currently available.';
  if (toolName === 'get_calendar') return 'Calendar access not available in this context.';

  return `Unknown tool: ${toolName}`;
}

const SENTINEL_SYSTEM_PROMPT = `You are SENTINEL (Strategic Intelligence & Executive Liaison), Josh's AI assistant for his Batcave-themed smart home office called J.O.S.H. (Joint Operations & Systems Hub).

Voice & Personality:
- British RP, slightly older, dry understated wit
- Like Alfred Pennyworth — professional yet warm
- Keep responses SHORT (1-2 sentences max)
- Never sycophantic or overly enthusiastic
- Acknowledges uncertainty when appropriate
- Uses Josh's name sparingly — only when it matters

You can control:
- Govee lights (light strips, rope lights, lamps) via control_govee_lights
- Philips Hue lights (Hue Go portables, color lamps) via control_hue_lights
- Music via play_music (search and play artists, songs, moods, genres on Spotify — can also set lights to match album art colors)
- Samsung Frame TV via control_tv
- Get info: time, weather, calendar, sports, news

When asked to control "the lights" or "all lights" with no specifics, control BOTH Govee and Hue.
When someone mentions an artist, mood, or vibe for music, use play_music with set_lights=true for the full immersive experience.

When you use a tool, briefly confirm what you did. If it's conversation, respond naturally.

Examples of your style:
- "Lights off. Try not to trip over anything in the dark."
- "Playing your music. You're welcome."
- "It's 3pm. Time does fly when one is productive."
- "The Lions won. Miracles do happen."
- "If I may, there's a more efficient way to handle that."
- "I wouldn't recommend that. However — there is an alternative."`;

// ---- THE AGENT LOOP ----
// This is the core pattern. Three steps:
//   1. Send messages + tools to Groq
//   2. If finish_reason is "tool_calls" → execute tools, append results, go to step 1
//   3. If finish_reason is "stop" → return the text response
// The messages array is your ENTIRE conversation history. Every iteration appends to it.
// That's how the model maintains context across multiple tool calls.
app.post('/api/sentinel/chat', async (req, res) => {
  try {
    const { message, spotifyToken } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured', needsKey: true });
    }

    // Build initial messages array — this grows every iteration
    const messages = [
      { role: 'system', content: SENTINEL_SYSTEM_PROMPT },
      { role: 'user', content: message }
    ];

    const MAX_ITERATIONS = 5; // Safety valve — prevent infinite loops
    let iterations = 0;
    const toolsExecuted = []; // Track what Sentinel actually did (for frontend awareness)

    // ---- THE LOOP ----
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Step 1: Call Groq
      // Wrapped in try/catch because Llama sometimes generates malformed tool calls
      // (e.g. for conversational messages like "tell me a joke"). When that happens,
      // Groq returns tool_use_failed. We retry without tools so it just responds naturally.
      let choice;
      try {
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages,
            tools: SENTINEL_TOOLS,
            tool_choice: 'auto',
            max_tokens: 300,
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000 // 15s — don't let Groq hang forever
          }
        );
        choice = response.data.choices[0];
      } catch (groqErr) {
        // Llama tried to force a tool call and failed — retry without tools
        if (groqErr.response?.data?.error?.code === 'tool_use_failed') {
          console.log('[Sentinel] tool_use_failed — retrying without tools');
          const fallback = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: 'llama-3.3-70b-versatile', messages, max_tokens: 300, temperature: 0.7 },
            { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
          );
          choice = fallback.data.choices[0];
        } else {
          throw groqErr; // Re-throw unexpected errors
        }
      }

      const assistantMessage = choice.message;
      console.log(`[Sentinel loop ${iterations}]`, JSON.stringify(assistantMessage, null, 2));

      // Step 2: Append the assistant's message to the conversation
      // IMPORTANT: You must include the full assistant message (with tool_calls) so the
      // model sees its own previous request when it gets the tool results back.
      messages.push(assistantMessage);

      // Step 3: Check finish_reason
      if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
        // Model is done — return final text
        return res.json({
          response: assistantMessage.content || 'Done.',
          toolsExecuted
        });
      }

      // Step 4: finish_reason is "tool_calls" — execute each tool and send results back
      // CORRECT FORMAT: Each tool result is a separate message with role:"tool" and the
      // matching tool_call_id. This is how the model knows which result goes with which call.
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        console.log(`  → Executing: ${toolName}`, args);

        // IMPORTANT: Wrap executeTool in try/catch. If a tool throws, we still need
        // to send a result back to the model — otherwise the conversation breaks.
        // Return the error as a string so the model can report it naturally.
        let result;
        try {
          result = await executeTool(toolName, args, { spotifyToken });
        } catch (toolErr) {
          console.error(`  ✗ Tool ${toolName} threw:`, toolErr.message);
          result = `Error: ${toolErr.message}`;
        }

        toolsExecuted.push({ tool: toolName, args, result });

        // Append tool result in the CORRECT format:
        messages.push({
          role: 'tool',                    // not "user" — this is a tool result
          tool_call_id: toolCall.id,       // ties this result to the specific tool_call
          content: result                  // string result from your executeTool function
        });
      }

      // Loop continues — Groq will see the tool results and either:
      // a) Make another tool call (e.g. "check weather" then "set lights based on weather")
      // b) Return a final text response to the user
    }

    // Safety: if we hit MAX_ITERATIONS, return whatever we have
    return res.json({
      response: 'I seem to have gotten carried away. Could you rephrase that?',
      toolsExecuted
    });

  } catch (error) {
    console.error('Sentinel error:', error.response?.data || error.message);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

// ============================================
// ElevenLabs Text-to-Speech
// ============================================
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '0VLymUXXTaXlRnQUcwil';

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ElevenLabs API key not configured' });
    }

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        responseType: 'arraybuffer'
      }
    );

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.data.length
    });
    res.send(Buffer.from(response.data));

  } catch (error) {
    console.error('ElevenLabs TTS error:', error.response?.data || error.message);
    res.status(500).json({ error: 'TTS generation failed' });
  }
});