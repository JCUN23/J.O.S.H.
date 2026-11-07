// Startup env validation.
// - Malformed values that would break things in confusing ways -> fail fast (exit 1).
// - Missing integration keys -> warn and keep going; that widget just won't work.
//   (Hard-failing here would take the whole wall panel down over one optional widget.)

const INTEGRATIONS = [
  { name: 'Google Calendar', all: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
  { name: 'Microsoft Calendar', all: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'] },
  { name: 'Govee', all: ['GOVEE_API_KEY'] },
  { name: 'Philips Hue', all: ['HUE_BRIDGE_IP', 'HUE_USERNAME'] },
  { name: 'SmartThings', any: [['SMARTTHINGS_CLIENT_ID', 'SMARTTHINGS_CLIENT_SECRET'], ['SMARTTHINGS_TOKEN']] },
  { name: 'Sentinel AI (Groq)', all: ['GROQ_API_KEY'] },
  { name: 'Anthropic chat', all: ['ANTHROPIC_API_KEY'] },
  { name: 'ElevenLabs TTS', all: ['ELEVENLABS_API_KEY'] },
];

const has = (k) => typeof process.env[k] === 'string' && process.env[k].trim() !== '';
// Values copied from .env.example and never filled in ("your_govee_api_key") count as
// missing: otherwise the check says ✅ and the provider fails later with a cryptic error.
const isPlaceholder = (v) => /^\s*(your[_-]|<|changeme|xxx+|placeholder)/i.test(String(v || ''));
const set = (k) => has(k) && !isPlaceholder(process.env[k]);

function checkUrl(key, errors, { originOnly = false } = {}) {
  const v = process.env[key];
  if (!has(key)) return;
  let u;
  try { u = new URL(v); } catch { return errors.push(`${key} is not a valid URL: "${v}"`); }
  if (!/^https?:$/.test(u.protocol)) errors.push(`${key} must be http(s): "${v}"`);
  if (v.endsWith('/')) errors.push(`${key} must not end with "/" (OAuth providers match redirect URIs exactly): "${v}"`);
  if (originOnly && u.pathname !== '/') errors.push(`${key} must be an origin with no path: "${v}"`);
}

// dotenv silently skips lines it can't parse (e.g. `const KEY = "x";` pasted from
// code), so the key just... isn't there. Point at those lines instead.
function findUnparsedLines(file = require('path').join(__dirname, '..', '.env')) {
  let text;
  try { text = require('fs').readFileSync(file, 'utf8'); } catch { return []; }
  return text.split(/\r?\n/).flatMap((line, i) => {
    if (/^\s*(#.*)?$/.test(line)) return [];                          // blank / comment
    if (/^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=/.test(line)) return []; // KEY=value
    const name = (line.match(/[A-Z][A-Z0-9_]{2,}/) || [])[0];
    return [`line ${i + 1}${name ? ` (${name})` : ''} isn't KEY=value, so it's ignored`];
  }).concat(
    // Two lines glued together (an append onto a file with no trailing newline):
    // KEY=valueOTHER_KEY=... parses, but both values end up wrong.
    text.split(/\r?\n/).flatMap((line, i) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/);
      const glued = m && m[2].match(/[A-Z][A-Z0-9_]{2,}=/);
      return glued ? [`line ${i + 1} (${m[1]}) has "${glued[0]}" inside its value: two lines merged?`] : [];
    })
  );
}

function validateEnv() {
  const errors = [];

  for (const problem of findUnparsedLines()) {
    console.warn(`⚠️  backend/.env ${problem}`); // never print the line itself: it may hold a secret
  }

  if (has('PORT')) {
    const p = Number(process.env.PORT);
    if (!Number.isInteger(p) || p < 1 || p > 65535) errors.push(`PORT must be an integer 1-65535: "${process.env.PORT}"`);
  }
  checkUrl('FRONTEND_URL', errors, { originOnly: true });

  const status = INTEGRATIONS.map(({ name, all, any }) => {
    const groups = any || [all];
    const ok = groups.some((g) => g.every(set));
    const missing = ok ? [] : groups[0].filter((k) => !has(k));
    const placeholders = ok ? [] : groups[0].filter((k) => has(k) && isPlaceholder(process.env[k]));
    return { name, enabled: ok, missing, placeholders };
  });

  console.log('\nIntegrations:');
  for (const s of status) {
    const why = [s.missing.length && `missing: ${s.missing.join(', ')}`,
      s.placeholders.length && `still the example placeholder: ${s.placeholders.join(', ')}`].filter(Boolean).join('; ');
    console.log(`  ${s.enabled ? '✅' : '⚠️ '} ${s.name}${s.enabled ? '' : `  (${why})`}`);
  }
  console.log('');

  if (errors.length) {
    console.error('❌ Invalid environment config:\n  - ' + errors.join('\n  - '));
    console.error('Fix backend/.env and restart.');
    process.exit(1);
  }
  return status;
}

module.exports = { validateEnv, findUnparsedLines, INTEGRATIONS, isPlaceholder };
