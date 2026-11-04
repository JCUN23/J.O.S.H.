// Google Calendar + Microsoft OAuth
const express = require('express');
const axios = require('axios');
const { FRONTEND_URL } = require('../lib/config');

const router = express.Router();

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

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Google token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

router.post('/auth/google/refresh', async (req, res) => {
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

    res.json(tokenResponse.data);
  } catch (error) {
    console.error('Microsoft token exchange error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to exchange token' });
  }
});

router.post('/auth/microsoft/refresh', async (req, res) => {
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

module.exports = router;
