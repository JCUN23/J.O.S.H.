// What to play and where: shortcuts, Josh's playlists, Spotify-made playlists, "on The Frame".
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockModules, tempStores } = require('./helpers');

const dir = tempStores();
process.env.SPOTIFY_STORE_PATH = path.join(dir, 'spotify.json');
process.env.SPOTIFY_DEVICE_POLL_MS = '1';
process.env.SPOTIFY_DEVICE_WAIT_MS = '20';

const state = { devices: [], devicesAfterLaunch: null, player: null, searched: [], tvCalls: [], tvResult: 'TV Office: on, art off, opened Spotify' };
mockModules({
  axios: {
    get: async (url, opts = {}) => {
      if (url.endsWith('/me/playlists')) return { data: { items: [{ name: 'Gym Bangers', uri: 'spotify:playlist:gym' }, null], next: null } };
      if (url.endsWith('/me/player/devices')) return { data: { devices: state.devices } };
      if (url.endsWith('/me/player')) return state.player ? { status: 200, data: state.player } : { status: 204, data: '' };
      if (url.endsWith('/search')) {
        state.searched.push(opts.params.q);
        return { data: { artists: { items: [{ name: 'Tyler, The Creator', uri: 'spotify:artist:tyler' }] }, tracks: { items: [] }, playlists: { items: [null, { name: 'Lo-fi Beats', uri: 'spotify:playlist:lofi' }] }, albums: { items: [] } } };
      }
      throw new Error(`unexpected GET ${url}`);
    },
  },
  './frameTv': {
    apply: async (opts) => {
      state.tvCalls.push(opts);
      if (state.devicesAfterLaunch) state.devices = state.devicesAfterLaunch;
      return opts.only === 'The Frame' ? state.tvResult : `TV: no TV matched "${opts.only}" (have: Office)`;
    },
  },
});
const sp = require('../lib/spotifyPlay');
const H = { Authorization: 'Bearer t' };

test('links and ids become URIs', () => {
  assert.equal(sp.toUri('https://open.spotify.com/playlist/37i9dQZEVXcJZyENOWUFo7?si=abc'), 'spotify:playlist:37i9dQZEVXcJZyENOWUFo7');
  assert.equal(sp.toUri('spotify:album:1234567890ab'), 'spotify:album:1234567890ab');
  assert.equal(sp.toUri('37i9dQZEVXcJZyENOWUFo7'), 'spotify:playlist:37i9dQZEVXcJZyENOWUFo7');
  assert.equal(sp.toUri('nope'), null);
});

test('Discover Weekly with no shortcut: explains how to save it instead of "couldn\'t find"', async () => {
  const r = await sp.resolve('Discover Weekly', { headers: H });
  assert.match(r.error, /Spotify hides those/);
  assert.match(r.error, /save this playlist as Discover Weekly/);
  assert.equal(state.searched.length, 0, 'no pointless search');
});

test('save this playlist as Discover Weekly, then it plays by name (any wording)', async () => {
  assert.match(await sp.saveCurrentAs('Discover Weekly', H), /Nothing to save/);
  state.player = { context: { type: 'playlist', uri: 'spotify:playlist:dw123' } };
  assert.match(await sp.saveCurrentAs('Discover Weekly', H), /Saved/);
  for (const q of ['Discover Weekly', 'my discover weekly playlist', 'discover weekly on spotify']) {
    assert.deepEqual((await sp.resolve(q, { headers: H })).playBody, { context_uri: 'spotify:playlist:dw123' }, q);
  }
});

test('env shortcuts work too; saved ones win', async () => {
  process.env.SPOTIFY_PLAYLISTS = 'Release Radar=https://open.spotify.com/playlist/37i9dQZEVXbrelease0000; Discover Weekly=spotify:playlist:fromenv0000';
  assert.equal((await sp.resolve('release radar', { headers: H })).playBody.context_uri, 'spotify:playlist:37i9dQZEVXbrelease0000');
  assert.equal((await sp.resolve('discover weekly', { headers: H })).playBody.context_uri, 'spotify:playlist:dw123');
  delete process.env.SPOTIFY_PLAYLISTS;
});

test("Josh's own playlists by name; search for the rest (null items skipped)", async () => {
  assert.equal((await sp.resolve('gym bangers playlist', { headers: H })).playBody.context_uri, 'spotify:playlist:gym');
  assert.equal((await sp.resolve('Tyler the Creator', { headers: H })).playBody.context_uri, 'spotify:artist:tyler');
  assert.equal((await sp.resolve('chill lofi', { headers: H, kind: 'playlist' })).playBody.context_uri, 'spotify:playlist:lofi');
});

test('device by name; The Frame with Spotify closed gets Spotify opened, then picked', async () => {
  state.devices = [{ id: 'p1', name: "Josh's iPhone", type: 'Smartphone' }];
  assert.equal((await sp.pickDevice('iphone', H)).device.id, 'p1');
  state.devicesAfterLaunch = [...state.devices, { id: 'tv1', name: '[TV] Samsung 7 Series (55)', type: 'TV' }];
  const r = await sp.pickDevice('The Frame', H);
  assert.equal(r.device.id, 'tv1');
  assert.deepEqual(state.tvCalls.at(-1), { only: 'The Frame', power: true, artMode: false, app: 'Spotify', fresh: false }, 'resume a backgrounded Spotify, never close it');
});

test('unknown device: says what exists; TV app failure is reported', async () => {
  state.devicesAfterLaunch = null;
  state.devices = [{ id: 'p1', name: "Josh's iPhone", type: 'Smartphone' }];
  assert.match((await sp.pickDevice('kitchen', H)).error, /No Spotify device called "kitchen" \(available: Josh's iPhone\)/);
  state.tvResult = 'TV Office: on, app error: Spotify is not installed';
  assert.match((await sp.pickDevice('The Frame', H)).error, /Opening Spotify on the TV failed/);
});
