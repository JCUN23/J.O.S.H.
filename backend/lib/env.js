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
  { name: 'Tesla', all: ['TESLA_CLIENT_ID', 'TESLA_CLIENT_SECRET'] },
];

const has = (k) => typeof process.env[k] === 'string' && process.env[k].trim() !== '';

function checkUrl(key, errors, { originOnly = false } = {}) {
  const v = process.env[key];
  if (!has(key)) return;
  let u;
  try { u = new URL(v); } catch { return errors.push(`${key} is not a valid URL: "${v}"`); }
  if (!/^https?:$/.test(u.protocol)) errors.push(`${key} must be http(s): "${v}"`);
  if (v.endsWith('/')) errors.push(`${key} must not end with "/" (OAuth providers match redirect URIs exactly): "${v}"`);
  if (originOnly && u.pathname !== '/') errors.push(`${key} must be an origin with no path: "${v}"`);
}

function validateEnv() {
  const errors = [];

  if (has('PORT')) {
    const p = Number(process.env.PORT);
    if (!Number.isInteger(p) || p < 1 || p > 65535) errors.push(`PORT must be an integer 1-65535: "${process.env.PORT}"`);
  }
  checkUrl('FRONTEND_URL', errors, { originOnly: true });
  checkUrl('TESLA_REDIRECT_URI', errors);

  const status = INTEGRATIONS.map(({ name, all, any }) => {
    const groups = any || [all];
    const ok = groups.some((g) => g.every(has));
    const missing = ok ? [] : groups[0].filter((k) => !has(k));
    return { name, enabled: ok, missing };
  });

  console.log('\nIntegrations:');
  for (const s of status) {
    console.log(`  ${s.enabled ? '✅' : '⚠️ '} ${s.name}${s.enabled ? '' : `  (missing: ${s.missing.join(', ')})`}`);
  }
  console.log('');

  if (errors.length) {
    console.error('❌ Invalid environment config:\n  - ' + errors.join('\n  - '));
    console.error('Fix backend/.env and restart.');
    process.exit(1);
  }
  return status;
}

module.exports = { validateEnv, INTEGRATIONS };
