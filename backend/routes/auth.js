// Google Calendar + Microsoft OAuth
const express = require('express');
const axios = require('axios');
const { FRONTEND_URL } = require('../lib/config');
const store = require('../lib/tokenStore');
const { getValidToken, toStored, publicView } = require('../lib/oauth');

const router = express.Router();

// ---- provider refresh calls (used by getValidToken) ----
const refreshGoogle = async (refresh_token) => (await axios.post('https://oauth2.googleapis.com/token', {
  refresh_token,
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  grant_type: 'refresh_token'
})).data;

const refreshMicrosoft = async (refresh_token) => (await axios.post(
  'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  new URLSearchParams({
    refresh_token,
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    grant_type: 'refresh_token'
  }),
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
)).data;

const REFRESHERS = { google: refreshGoogle, microsoft: refreshMicrosoft };

// Google Calendar OAuth
router.get('/auth/google', (req, res) => {
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

router.post('/auth/google/token', async (req, res) => {
  try {
    const { code } = req.body;

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: FRONTEND_URL,
      grant_type: 'authorization_code'
    });

    // Google's consent screen has a checkbox per permission; an unticked calendar box
    // yields a login that can only read the email address. Don't keep it: say so.
    if (!String(tokenResponse.data.scope || '').includes('calendar')) {
      return res.status(400).json({ error: 'calendar_scope_missing',
        message: "Google didn't grant calendar access. Connect again and tick the calendar box on Google's permission screen." });
    }
    const saved = store.set('google', toStored(tokenResponse.data, store.get('google')?.refresh_token));
    res.json(publicView(saved));
  } catch (error) {
    console.error('Google token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});



// Microsoft/Outlook Calendar OAuth
router.get('/auth/microsoft', (req, res) => {
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

router.post('/auth/microsoft/token', async (req, res) => {
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

    const saved = store.set('microsoft', toStored(tokenResponse.data, store.get('microsoft')?.refresh_token));
    res.json(publicView(saved));
  } catch (error) {
    console.error('Microsoft token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

// ---- shared endpoints for server-stored logins ----
// (Express 5 dropped inline-regex params like :provider(a|b), so register per provider.)
for (const provider of Object.keys(REFRESHERS)) {
  // GET -> { access_token, expires_at } | 404 { connected: false }
  router.get(`/auth/${provider}/access-token`, async (req, res, next) => {
    try {
      const t = await getValidToken(provider, REFRESHERS[provider]);
      if (!t) return res.status(404).json({ connected: false });
      res.json(publicView(t));
    } catch (err) { next(err); }
  });

  // One-time migration: a browser that still holds a refresh token from the old
  // localStorage flow hands it over, so nobody has to log in again.
  router.post(`/auth/${provider}/import`, async (req, res, next) => {
    try {
      const { refresh_token } = req.body || {};
      if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });
      if (store.isConnected(provider)) return res.json({ imported: false, connected: true });
      const data = await REFRESHERS[provider](refresh_token); // validates the token
      store.set(provider, toStored(data, refresh_token));
      res.json({ imported: true, connected: true });
    } catch (err) {
      if (err.response?.status === 400) return res.status(400).json({ error: 'Refresh token rejected' });
      next(err);
    }
  });

  router.post(`/auth/${provider}/disconnect`, (req, res) => {
    store.clear(provider);
    res.json({ connected: false });
  });
}

module.exports = router;
module.exports.REFRESHERS = REFRESHERS;   // lib/calendar.js reads the calendar server-side
