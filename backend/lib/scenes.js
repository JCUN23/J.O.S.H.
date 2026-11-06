// Scenes: one name, many devices. Stored in data/scenes.json (seeded with defaults
// on first run) so they can be edited later without touching code.
const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { runActions, describe } = require('./actions');
const activity = require('./activity');

const WARM = 2700; const NEUTRAL = 4000; const COOL = 5500;

const DEFAULT_SCENES = [
  { id: 'movie-night', name: 'Movie Night', icon: 'film', description: 'Dim, warm lights; TV out of Art Mode',
    actions: [{ type: 'lights', kelvin: WARM, brightness: 12 }, { type: 'tv', artMode: false, power: true }] },
  { id: 'relax', name: 'Relax', icon: 'sofa', description: 'Warm amber at half brightness',
    actions: [{ type: 'lights', color: { r: 255, g: 140, b: 40 }, brightness: 45 }] },
  { id: 'focus', name: 'Focus', icon: 'target', description: 'Bright, cool white for working',
    actions: [{ type: 'lights', kelvin: COOL, brightness: 100 }] },
  { id: 'bright', name: 'All Bright', icon: 'sun', description: 'Every light on, neutral white',
    actions: [{ type: 'lights', kelvin: NEUTRAL, brightness: 100 }] },
  { id: 'goodnight', name: 'Goodnight', icon: 'moon', description: 'All lights off; TVs to Art Mode',
    actions: [{ type: 'lights', on: false }, { type: 'tv', artMode: true }] },
  { id: 'all-off', name: 'All Off', icon: 'power', description: 'Every light and TV off',
    actions: [{ type: 'lights', on: false }, { type: 'tv', power: false }] },
];

const store = createJsonStore(
  process.env.SCENES_STORE_PATH || path.join(__dirname, '..', 'data', 'scenes.json'),
  { label: 'Scene store' }
);

function list() {
  let scenes = store.get('scenes');
  if (!scenes) { scenes = DEFAULT_SCENES; store.set('scenes', scenes); }
  return scenes;
}

// "movie night", "Movie Night", "movie-night" -> scene
function find(query) {
  const q = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!q) return null;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return list().find((s) => norm(s.id) === q || norm(s.name) === q)
    || list().find((s) => q.includes(norm(s.name)) || norm(s.name).includes(q))
    || null;
}

async function activate(scene, { source = 'panel', reason } = {}) {
  const results = await runActions(scene.actions);
  const entry = activity.log({
    source, title: `Scene: ${scene.name}`, results,
    detail: reason || scene.actions.map(describe).join(', '),
  });
  return { scene: scene.name, results, ok: entry.ok };
}

module.exports = { list, find, activate, DEFAULT_SCENES };
