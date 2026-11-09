// Which Hue lights Sentinel uses. The bridge also lists bulbs Josh doesn't use or
// recognize ("Hue color lamp 1/2/3"); HUE_LIGHTS limits the widget, "the lights",
// the AI's Hue tool and music color sync to the ones he does. Names or ids, comma
// separated, case-insensitive. "*" = every light on the bridge.
// Nothing is deleted from the bridge: unset HUE_LIGHTS=* to see them all again.
const spec = () => (process.env.HUE_LIGHTS ?? 'Left Go,Right Go').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
let warned = false;

// { "4": {name, state...}, ... } -> the same map with only the allowed lights
function filterLights(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return map;       // bridge error arrays pass through
  const terms = spec();
  if (!terms.length || terms.includes('*')) return map;
  const kept = Object.entries(map).filter(([id, l]) => terms.includes(id) || terms.includes(String(l?.name || '').toLowerCase()));
  if (!kept.length) {
    if (!warned) console.warn(`Hue: HUE_LIGHTS="${terms.join(',')}" matches no light (have: ${Object.values(map).map((l) => l?.name).join(', ')}); showing all`);
    warned = true;
    return map;
  }
  return Object.fromEntries(kept);
}

// Rooms/zones that contain only allowed lights (a room with other bulbs in it would
// switch those too).
function filterGroups(groups, lightsMap) {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return groups;
  const allowed = new Set(Object.keys(filterLights(lightsMap) || {}));
  if (allowed.size === Object.keys(lightsMap || {}).length) return groups;
  return Object.fromEntries(Object.entries(groups).filter(([, g]) => (g?.lights || []).length && g.lights.every((id) => allowed.has(String(id)))));
}

const filtering = () => { const t = spec(); return t.length > 0 && !t.includes('*'); };

module.exports = { filterLights, filterGroups, filtering };
