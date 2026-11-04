// Govee lights
const express = require('express');
const axios = require('axios');
const { GOVEE_API_KEY, GOVEE_BASE_URL } = require('../lib/config');

const router = express.Router();

// Get all Govee devices
router.get('/api/govee/devices', async (req, res) => {
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
router.post('/api/govee/control', async (req, res) => {
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
router.get('/api/govee/state/:device/:model', async (req, res) => {
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

module.exports = router;
