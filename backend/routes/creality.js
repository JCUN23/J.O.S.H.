// Creality Cloud 3D printer
const express = require('express');
const axios = require('axios');

const router = express.Router();

const CREALITY_API_BASE = 'https://api.creality.com';
let crealityToken = null;

// Login to Creality Cloud
router.post('/api/creality/login', async (req, res) => {
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
router.get('/api/creality/printers', async (req, res) => {
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
router.get('/api/creality/status/:deviceId', async (req, res) => {
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
router.get('/api/printer/status', async (req, res) => {
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
router.post('/api/creality/control/:deviceId', async (req, res) => {
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

module.exports = router;
