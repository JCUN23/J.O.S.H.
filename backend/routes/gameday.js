// Game Day Mode (triggered by SportsWidget)
const express = require('express');
const axios = require('axios');
const { SMARTTHINGS_BASE_URL, getSmartThingsToken } = require('../lib/smartthings');

const router = express.Router();

// ============================================
// Game Day Mode API (triggered by SportsWidget)
// ============================================
router.post('/api/game-day', async (req, res) => {
  const { team } = req.body;
  if (!team) return res.status(400).json({ error: 'No team specified' });

  const results = [];

  // Wake TV from art mode → home screen
  try {
    const token = await getSmartThingsToken();
    if (token) {
      const devicesRes = await axios.get(`${SMARTTHINGS_BASE_URL}/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const frameTV = devicesRes.data.items?.find(d =>
        d.label?.toLowerCase().includes('frame') &&
        d.components?.[0]?.capabilities?.some(c => c.id === 'samsungvd.mediaInputSource')
      );
      if (frameTV) {
        const deviceId = frameTV.deviceId;
        const sendCmd = (capability, command, cmdArgs = []) =>
          axios.post(`${SMARTTHINGS_BASE_URL}/devices/${deviceId}/commands`,
            { commands: [{ capability, command, arguments: cmdArgs }] },
            { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
          );
        await sendCmd('samsungvd.ambient', 'off');
        await sendCmd('switch', 'on');
        await new Promise(resolve => setTimeout(resolve, 2000));
        await sendCmd('samsungvd.remoteControl', 'send', ['HOME']);
        results.push('TV woken up and on home screen');
      } else {
        results.push('Frame TV not found on SmartThings');
      }
    } else {
      results.push('SmartThings token not configured');
    }
  } catch (err) {
    results.push(`TV error: ${err.message}`);
  }

  console.log(`🏟️ Game Day Mode activated for ${team}: ${results.join(', ')}`);
  res.json({ message: `Game Day Mode: ${results.join('. ')}`, team });
});

module.exports = router;
