// control_spotify: real pause/resume/skip/volume, and "resume on The Frame" moves playback there.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mockModules, tempStores, httpError } = require('./helpers');

tempStores();
const sent = [];
let failWith = null;
mockModules({
  sharp: () => ({}),
  axios: {
    put: async (url, body, opts) => { if (failWith) throw failWith; sent.push(['PUT', url.replace(/^.*\/v1/, ''), body, opts?.params]); return { data: {} }; },
    post: async (url, body, opts) => { sent.push(['POST', url.replace(/^.*\/v1/, ''), body, opts?.params]); return { data: {} }; },
    get: async (url) => {
      if (url.endsWith('/me/player/devices')) return { data: { devices: [{ id: 'tv1', name: '[TV] Samsung The Frame 55', type: 'TV' }] } };
      throw new Error(`unexpected GET ${url}`);
    },
  },
});
const { executeTool } = require('../lib/sentinel/executeTool');
const run = (args) => executeTool('control_spotify', args, { spotifyToken: 'tok' });

test('resume on The Frame transfers playback there (keeps the song)', async () => {
  assert.equal(await run({ action: 'play', device: 'The Frame' }), 'Resumed on [TV] Samsung The Frame 55.');
  assert.deepEqual(sent.at(-1), ['PUT', '/me/player', { device_ids: ['tv1'], play: true }, undefined]);
});

test('pause / skip / volume on the active device', async () => {
  sent.length = 0;
  assert.equal(await run({ action: 'pause' }), 'Paused.');
  assert.equal(await run({ action: 'next' }), 'Skipped.');
  assert.equal(await run({ action: 'volume', value: '30' }), 'Volume 30%.');
  assert.deepEqual(sent.map((c) => c.slice(0, 2)), [['PUT', '/me/player/pause'], ['POST', '/me/player/next'], ['PUT', '/me/player/volume']]);
  assert.equal(sent[2][3].volume_percent, 30);
});

test('no active device says so and how to fix it', async () => {
  failWith = httpError(404, { error: { message: 'Player command failed: No active device found' } });
  assert.match(await run({ action: 'play' }), /No active Spotify device. Say where/);
  failWith = null;
  assert.match(await executeTool('control_spotify', { action: 'pause' }, {}), /not connected/);
});
