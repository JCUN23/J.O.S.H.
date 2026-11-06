// Action runner for scenes and rules. An action is plain data, so scenes/rules can
// be stored, edited, and later created by Sentinel from a voice request.
//   { type: 'lights', on?, brightness? (1-100), color? {r,g,b}, kelvin?, target? 'all'|'govee'|'hue' }
//   { type: 'tv', power?, artMode?, home? }
//   { type: 'gameDay', team }
//   { type: 'delay', ms }
const devices = require('./devices');

const LIGHT_TARGETS = { all: ['govee', 'hue'], govee: ['govee'], hue: ['hue'] };

function describe(a) {
  if (a.type === 'lights') {
    if (a.on === false) return 'lights off';
    return ['lights', a.color && `rgb(${a.color.r},${a.color.g},${a.color.b})`, a.kelvin && `${a.kelvin}K`,
      a.brightness && `${a.brightness}%`].filter(Boolean).join(' ');
  }
  if (a.type === 'tv') return `TV ${[a.power === true && 'on', a.power === false && 'off', a.artMode === true && 'art mode', a.artMode === false && 'art off'].filter(Boolean).join(', ')}`;
  if (a.type === 'gameDay') return `Game Day (${a.team})`;
  if (a.type === 'delay') return `wait ${a.ms}ms`;
  return a.type;
}

async function runOne(a) {
  switch (a.type) {
    case 'lights': {
      const targets = LIGHT_TARGETS[a.target || 'all'] || LIGHT_TARGETS.all;
      const jobs = targets.map((t) => (t === 'govee' ? devices.goveeApply(a) : devices.hueApply(a)));
      return (await Promise.allSettled(jobs)).map((r, i) =>
        r.status === 'fulfilled' ? r.value : `${targets[i] === 'govee' ? 'Govee' : 'Hue'}: error: ${r.reason?.message}`);
    }
    case 'tv':
      return [await devices.tvApply(a)];
    case 'gameDay': {
      // lazy require: gameDay -> activity, avoid a load-order cycle with scenes
      const { findTeam } = require('./teams');
      const team = findTeam(a.team);
      if (!team) return [`Game Day: unknown team "${a.team}"`];
      const entry = await require('./gameDay').activate(team, { reason: 'scene' });
      return entry.results;
    }
    case 'delay':
      await devices.delay(Math.min(Number(a.ms) || 0, 60_000));
      return [];
    default:
      return [`unknown action "${a.type}"`];
  }
}

// Run in order (so delays mean something); one failing action never stops the rest.
async function runActions(actions = []) {
  const results = [];
  for (const a of actions) {
    try { results.push(...await runOne(a)); }
    catch (err) { results.push(`${describe(a)}: error: ${err.response?.data?.message || err.message}`); }
  }
  return results;
}

module.exports = { runActions, describe };
