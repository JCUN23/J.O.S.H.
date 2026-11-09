// Philips Hue (local bridge)
const express = require('express');
const axios = require('axios');
const { HUE_BRIDGE_IP, HUE_USERNAME } = require('../lib/config');
const { filterLights, filterGroups } = require('../lib/hueLights');

const router = express.Router();

// The bridge answers HTTP 200 even on failure. Success for these reads is an object
// map ({ "1": {...light} }); failure is an array of { error }. Turn the latter into a
// real error so the frontend never mistakes error objects for lights.
function sendHueRead(res, data) {
  if (Array.isArray(data)) {
    const err = data.find((x) => x && x.error)?.error;
    const message = err?.type === 1
      ? 'Hue bridge rejected HUE_USERNAME (unauthorized user). Check backend/.env.'
      : `Hue bridge error: ${err?.description || 'unexpected response'}`;
    console.error('Hue bridge error:', err || data);
    return res.status(502).json({ error: message, hueErrorType: err?.type });
  }
  return res.json(data);
}

// ===== PHILIPS HUE API ROUTES =====

// Get all lights
router.get('/api/hue/lights', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured. Add HUE_BRIDGE_IP and HUE_USERNAME to .env' });
    }

    const response = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`);
    sendHueRead(res, filterLights(response.data));     // only HUE_LIGHTS (the two Go lamps)
  } catch (error) {
    console.error('Hue lights error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Control a light
router.put('/api/hue/lights/:id', async (req, res) => {
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
router.get('/api/hue/groups', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const [response, lights] = await Promise.all([
      axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/groups`),
      axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/lights`),
    ]);
    sendHueRead(res, filterGroups(response.data, lights.data));
  } catch (error) {
    console.error('Hue groups error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Control a group/room
router.put('/api/hue/groups/:id', async (req, res) => {
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
router.get('/api/hue/scenes', async (req, res) => {
  try {
    if (!HUE_BRIDGE_IP || !HUE_USERNAME) {
      return res.status(401).json({ error: 'Hue Bridge not configured' });
    }

    const response = await axios.get(`http://${HUE_BRIDGE_IP}/api/${HUE_USERNAME}/scenes`);
    sendHueRead(res, response.data);
  } catch (error) {
    console.error('Hue scenes error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Activate a scene
router.put('/api/hue/groups/:groupId/scene/:sceneId', async (req, res) => {
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

module.exports = router;
