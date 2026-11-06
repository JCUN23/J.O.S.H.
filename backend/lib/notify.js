// Push notifications to your phone through ntfy (https://ntfy.sh, or self-hosted). Free,
// no account. Install the ntfy app, subscribe to NTFY_TOPIC, done.
// On the public ntfy.sh server the topic name works as the password: anyone who knows it
// can read your notifications, so make it long and random (setup prints one for you).
//   NTFY_TOPIC=sentinel-<random>   NTFY_URL=https://ntfy.sh   NTFY_TOKEN=<optional, self-hosted auth>
//   NTFY_MUTE=presence,rules        categories to silence
const axios = require('axios');

const CATEGORIES = ['system', 'gameday', 'print', 'presence', 'rules', 'test'];
const configured = () => Boolean(process.env.NTFY_TOPIC);
const muted = () => (process.env.NTFY_MUTE || '').split(',').map((s) => s.trim()).filter(Boolean);

// Never throws: a notification failing must not break the thing that triggered it.
async function notify({ title, message, category = 'system', priority = 3, tags = [], click } = {}) {
  if (!configured()) return { sent: false, reason: 'NTFY_TOPIC not set' };
  if (muted().includes(category)) return { sent: false, reason: `${category} muted` };
  const base = (process.env.NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, '');
  const body = { topic: process.env.NTFY_TOPIC, title, message: message || title, priority, tags };
  if (click) body.click = click;
  const headers = process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {};
  try {
    await axios.post(base, body, { headers, timeout: 8000 });   // JSON publish: UTF-8 safe titles
    return { sent: true };
  } catch (err) {
    const reason = err.response ? `ntfy HTTP ${err.response.status}` : err.message;
    console.warn(`ntfy: ${title} not sent (${reason})`);
    return { sent: false, reason };
  }
}

module.exports = { notify, configured, CATEGORIES };
