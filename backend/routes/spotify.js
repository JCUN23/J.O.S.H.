// Spotify: login still happens in the browser (PKCE), but the browser hands the
// tokens to the server, which owns refreshing. Every device then shares one login,
// and it no longer dies after an hour (the old flow discarded the refresh token).
const express = require('express');
const axios = require('axios');
const { SPOTIFY_CLIENT_ID } = require('../lib/config');
const store = require('../lib/tokenStore');
const { getValidToken, toStored, publicView } = require('../lib/oauth');

const router = express.Router();

// PKCE refresh: public client, so client_id only (no secret). Spotify may rotate the
// refresh token on every refresh; oauth.getValidToken serializes refreshes for that reason.
const refreshSpotify = async (refresh_token) => (await axios.post(
  'https://accounts.spotify.com/api/token',
  new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: SPOTIFY_CLIENT_ID }),
  { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
)).data;

router.post('/auth/spotify/store', (req, res) => {
  const { access_token, refresh_token, expires_in } = req.body || {};
  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'access_token and refresh_token required' });
  }
  const saved = store.set('spotify', toStored({ access_token, refresh_token, expires_in }));
  res.json(publicView(saved));
});

router.get('/auth/spotify/access-token', async (req, res, next) => {
  try {
    const t = await getValidToken('spotify', refreshSpotify);
    if (!t) return res.status(404).json({ connected: false });
    res.json(publicView(t));
  } catch (err) { next(err); }
});

router.post('/auth/spotify/disconnect', (req, res) => {
  store.clear('spotify');
  res.json({ connected: false });
});

// For server-side callers (Sentinel's Spotify tools).
const getSpotifyAccessToken = async () => (await getValidToken('spotify', refreshSpotify))?.access_token || null;

module.exports = router;
module.exports.getSpotifyAccessToken = getSpotifyAccessToken;
