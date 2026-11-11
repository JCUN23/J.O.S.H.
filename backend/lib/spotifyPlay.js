// What to play and where, for Sentinel's play_music tool.
//
// Order: saved shortcuts -> Josh's own playlists -> Spotify search.
// Shortcuts exist because Spotify hides its own personalized playlists (Discover Weekly,
// Release Radar, Daily Mix...) from search for apps in development mode (since Nov 2024).
// Playing one by its link still works, so: play it on your phone once, then
// "Alfred, save this playlist as Discover Weekly" (saveCurrentAs), or seed links with
//   SPOTIFY_PLAYLISTS="Discover Weekly=https://open.spotify.com/playlist/37i9...; Release Radar=..."
//
// Device: "on The Frame" picks that Spotify Connect device. A Frame TV with Spotify closed
// isn't a Spotify device yet, so we open the Spotify app on it and wait for it to appear.
const path = require('path');
const axios = require('axios');
const { createJsonStore } = require('./jsonStore');

const BASE = 'https://api.spotify.com/v1';
const store = createJsonStore(
  process.env.SPOTIFY_STORE_PATH || path.join(__dirname, '..', 'data', 'spotify.json'),
  { label: 'Spotify shortcuts' }
);
const opt = () => ({ waitMs: Number(process.env.SPOTIFY_DEVICE_WAIT_MS ?? 15000), pollMs: Number(process.env.SPOTIFY_DEVICE_POLL_MS ?? 1000) });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const MADE_FOR_YOU = /discover weekly|release radar|daily mix|on repeat|repeat rewind|daylist|time capsule|\bblend\b|your top songs/;
const STOP = new Set(['the', 'my', 'a', 'playlist', 'spotify', 'on', 'play']);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).join(' ');

// "https://open.spotify.com/playlist/ID?si=..", "spotify:playlist:ID", or a bare ID -> URI
function toUri(link) {
  const s = String(link || '').trim();
  const m = s.match(/(playlist|album|artist|track)[/:]([A-Za-z0-9]{10,})/);
  if (m) return `spotify:${m[1]}:${m[2]}`;
  return /^[A-Za-z0-9]{22}$/.test(s) ? `spotify:playlist:${s}` : null;
}

function shortcuts() {
  const saved = store.get('shortcuts') || {};
  const fromEnv = {};
  for (const pair of String(process.env.SPOTIFY_PLAYLISTS || '').split(/[;\n]/)) {
    const i = pair.indexOf('=');
    const uri = i > 0 && toUri(pair.slice(i + 1));
    if (uri) fromEnv[norm(pair.slice(0, i))] = { name: pair.slice(0, i).trim(), uri };
  }
  return { ...fromEnv, ...saved };
}

const matchName = (items, query, nameOf = (x) => x.name) => {
  const q = norm(query);
  if (!q) return null;
  return items.find((x) => norm(nameOf(x)) === q)
    || (q.length >= 4 ? items.find((x) => { const n = norm(nameOf(x)); return n && (n.includes(q) || q.includes(n)); }) : null)
    || null;
};

async function myPlaylists(headers) {
  const out = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const { data } = await axios.get(`${BASE}/me/playlists`, { headers, params: { limit: 50, offset } });
    out.push(...(data?.items || []).filter(Boolean));
    if (!data?.next) break;
  }
  return out;
}

// -> { playBody, imageUrl, description } | { error }
async function resolve(query, { headers, kind } = {}) {
  const q = String(query || '');
  const hit = shortcuts()[norm(q)] || matchName(Object.values(shortcuts()), q);
  if (hit) return { playBody: { context_uri: hit.uri }, imageUrl: null, description: `Playing "${hit.name}".` };

  if (kind === 'playlist' || /playlist/i.test(q) || MADE_FOR_YOU.test(q.toLowerCase())) {
    try {
      const mine = matchName(await myPlaylists(headers), q);
      if (mine) return { playBody: { context_uri: mine.uri }, imageUrl: mine.images?.[0]?.url, description: `Playing your playlist "${mine.name}".` };
    } catch { /* fall through to search */ }
  }
  if (MADE_FOR_YOU.test(q.toLowerCase())) {
    return { error: `"${q}" is a playlist Spotify makes for Josh, and Spotify hides those from apps like Sentinel. `
      + `Tell Josh: play it on his phone once, then say "save this playlist as ${q.replace(/\bplaylist\b/i, '').trim()}", and it will work by name after that.` };
  }

  const { data } = await axios.get(`${BASE}/search`, { headers, params: { q, type: 'artist,track,playlist,album', limit: 3 } });
  const artists = (data.artists?.items || []).filter(Boolean);
  const tracks = (data.tracks?.items || []).filter(Boolean);
  const playlists = (data.playlists?.items || []).filter(Boolean);
  const albums = (data.albums?.items || []).filter(Boolean);
  const pl = () => playlists[0] && { playBody: { context_uri: playlists[0].uri }, imageUrl: playlists[0].images?.[0]?.url, description: `Playing playlist "${playlists[0].name}".` };
  const al = () => albums[0] && { playBody: { context_uri: albums[0].uri }, imageUrl: albums[0].images?.[0]?.url, description: `Playing the album "${albums[0].name}" by ${albums[0].artists?.[0]?.name}.` };
  if (kind === 'playlist' && pl()) return pl();
  if (kind === 'album' && al()) return al();
  if (artists[0] && artists[0].name.toLowerCase().includes(q.toLowerCase().split(' ')[0])) {
    return { playBody: { context_uri: artists[0].uri }, imageUrl: artists[0].images?.[0]?.url, description: `Playing ${artists[0].name} on shuffle.` };
  }
  if (tracks[0]) return { playBody: { uris: [tracks[0].uri] }, imageUrl: tracks[0].album?.images?.[0]?.url, description: `Playing "${tracks[0].name}" by ${tracks[0].artists?.[0]?.name}.` };
  return pl() || al() || { error: `Couldn't find anything on Spotify for "${q}".` };
}

const listDevices = async (headers) => (await axios.get(`${BASE}/me/player/devices`, { headers })).data?.devices || [];

// -> { device } | { error }
async function pickDevice(want, headers) {
  const devices = await listDevices(headers);
  const found = matchName(devices, want);
  if (found) return { device: found };
  // Maybe it's a Frame TV with Spotify closed: open Spotify there and wait for it.
  const frame = require('./frameTv');
  const t0 = Date.now();
  // fresh:false: a Spotify already open in the background comes forward instead of being
  // closed and cold-started (Nov 11: 30s to start Discover Weekly on the Frame)
  const r = await frame.apply({ only: want, power: true, artMode: false, app: 'Spotify', fresh: false });
  const tvMs = Date.now() - t0;
  if (/^TV: (no TV matched|none configured)/.test(r) || /app error/.test(r)) {
    const have = devices.map((d) => d.name).join(', ') || 'none';
    return { error: `No Spotify device called "${want}" (available: ${have}).${/app error/.test(r) ? ` Opening Spotify on the TV failed: ${r}` : ''}` };
  }
  const before = new Set(devices.map((d) => d.id));
  const { waitMs, pollMs } = opt();
  for (let waited = 0; waited <= waitMs; waited += pollMs) {
    await delay(pollMs);
    const now = await listDevices(headers);
    const d = matchName(now, want) || now.find((x) => !before.has(x.id) && x.type === 'TV');
    if (d) {
      console.log(`🎵 Spotify on ${want}: TV steps ${(tvMs / 1000).toFixed(1)}s (${r}); showed up as a Spotify device ${((Date.now() - t0 - tvMs) / 1000).toFixed(1)}s later`);
      return { device: d };
    }
  }
  console.log(`🎵 Spotify on ${want}: TV steps ${(tvMs / 1000).toFixed(1)}s (${r}); never showed up as a Spotify device`);
  return { error: `Opened Spotify on ${want}, but it didn't show up as a Spotify device. Is the TV's Spotify app signed in?` };
}

// "save this playlist as Discover Weekly": remember what's playing right now.
async function saveCurrentAs(name, headers) {
  const { data, status } = await axios.get(`${BASE}/me/player`, { headers, validateStatus: () => true });
  const ctx = status === 200 ? data?.context : null;
  if (!ctx?.uri || !/^spotify:(playlist|album|artist)/.test(ctx.uri)) {
    return 'Nothing to save: play the playlist on any device first (not a single song), then ask again.';
  }
  const all = store.get('shortcuts') || {};
  all[norm(name)] = { name: String(name).trim(), uri: ctx.uri };
  store.set('shortcuts', all);
  return `Saved. "${String(name).trim()}" now plays that ${ctx.type || 'playlist'}.`;
}

module.exports = { resolve, pickDevice, saveCurrentAs, toUri, norm, MADE_FOR_YOU, BASE };
