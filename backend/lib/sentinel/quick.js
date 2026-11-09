// Instant commands: the everyday phrasings, handled without the AI. No tokens, no rate
// limit, ~instant, and the same answer whether it came from the panel or the Pi mic.
// Only whole-sentence matches; anything longer or compound ("...and play jazz") goes to
// the AI, which can do every part. (These used to live in the browser, where they drifted
// from the backend: "turn off the lights" there said "Going dark" over lit lights.)
const { COLOR_MAP } = require('../color');

const clean = (text) => String(text || '').toLowerCase()
  .replace(/^(hey\s+)?(alfred|sentinel|jarvis)\b[,\s]*/, '')
  .replace(/\b(please|for me|right now)\b/g, ' ')
  .replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const failed = (r) => /fail|error|not configured|no lights matched|: 0\//i.test(r);

const COLORS = Object.keys(COLOR_MAP).join('|');
const INTENTS = [
  { re: /^(?:(?:turn|switch) (on|off) (?:the |all |all the )?lights?|(?:(?:turn|switch) )?(?:the |all |all the )?lights? (on|off))$/,
    tool: 'control_all_lights', args: (m) => ({ action: m[1] || m[2] }),
    say: (m) => pick((m[1] || m[2]) === 'on' ? ['Lights on.', 'Done.', 'Lighting up.'] : ['Lights off.', 'Going dark.', 'Done.']) },
  { re: new RegExp(`^(?:set|make|change|turn) (?:the |all |all the )?lights? (?:to )?(${COLORS})$`),
    tool: 'control_all_lights', args: (m) => ({ action: 'color', value: m[1] }), say: (m) => `Lights set to ${m[1]}.` },
  { re: /^(?:(?:set|dim|turn) )?(?:the )?(?:lights?|brightness) (?:to |at )?(\d{1,3}) ?(?:%|percent)?$/,
    tool: 'control_all_lights', args: (m) => ({ action: 'brightness', value: String(Math.min(100, +m[1])) }), say: (m) => `Lights at ${Math.min(100, +m[1])} percent.` },
  { re: /^(?:pause|stop)(?: the)?(?: music| spotify| playback| song)?$/, tool: 'control_spotify', args: () => ({ action: 'pause' }) },
  { re: /^(?:resume|unpause|play|start)(?: the| my)? (?:music|spotify|playback|tunes)$/, tool: 'control_spotify', args: () => ({ action: 'play' }) },
  { re: /^(?:next|skip)(?: this| the)?(?: song| track)?$/, tool: 'control_spotify', args: () => ({ action: 'next' }) },
  { re: /^(?:previous|last|go back)(?: song| track)?$/, tool: 'control_spotify', args: () => ({ action: 'previous' }) },
  { re: /^what(?:'s| is) the time$|^what time is it$/, tool: 'get_time', args: () => ({}), say: (m, r) => `It's ${r}.` },
];

// -> { response, toolsExecuted, quick: true } | null (not an instant command)
async function quickCommand(message, ctx = {}) {
  const text = clean(message);
  for (const intent of INTENTS) {
    const m = text.match(intent.re);
    if (!m) continue;
    const args = intent.args(m);
    const { executeTool } = require('./executeTool');
    const result = await executeTool(intent.tool, args, ctx);
    const response = failed(result) || !intent.say ? result : intent.say(m, result);
    return { response, toolsExecuted: [{ tool: intent.tool, args, result }], quick: true };
  }
  return null;
}

module.exports = { quickCommand, clean };
