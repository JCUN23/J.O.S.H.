// Color helpers shared by Govee + Hue tool execution

// ---- Color name → RGB lookup (shared by Govee + Hue tool execution) ----
const COLOR_MAP = {
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 255, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  purple: { r: 128, g: 0, b: 255 },
  cyan: { r: 0, g: 255, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  orange: { r: 255, g: 165, b: 0 },
  pink: { r: 255, g: 105, b: 180 },
  white: { r: 255, g: 255, b: 255 },
  warm: { r: 255, g: 180, b: 100 },
  cool: { r: 180, g: 210, b: 255 },
};

function parseColor(value) {
  if (!value) return null;
  const lower = value.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  // Try hex: #rrggbb
  const hex = lower.replace('#', '');
  if (/^[0-9a-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

// RGB → Hue bridge HSB (hue: 0-65535, sat: 0-254, bri: 0-254)
function rgbToHueBridgeHSB({ r, g, b }) {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rN) h = ((gN - bN) / delta + (gN < bN ? 6 : 0)) / 6;
    else if (max === gN) h = ((bN - rN) / delta + 2) / 6;
    else h = ((rN - gN) / delta + 4) / 6;
  }
  const s = max === 0 ? 0 : delta / max;
  return { hue: Math.round(h * 65535), sat: Math.round(s * 254), bri: Math.round(max * 254) };
}

module.exports = { COLOR_MAP, parseColor, rgbToHueBridgeHSB };
