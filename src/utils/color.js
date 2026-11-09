// Color math for the light pickers. RGB 0-255, HSV with h 0-360 and s/v 0-1.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const rgbToHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');

// "#ff8800", "ff8800", "#f80" -> { r, g, b } | null
export function hexToRgb(hex) {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export function hsvToRgb({ h, s, v }) {
    const c = v * s;
    const hp = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = v - c;
    return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
}

export function rgbToHsv({ r, g, b }) {
    const [R, G, B] = [r, g, b].map((n) => n / 255);
    const max = Math.max(R, G, B);
    const d = max - Math.min(R, G, B);
    let h = 0;
    if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// Philips Hue's own RGB -> CIE xy conversion (gamma-corrected, Wide RGB D65), which
// is what the bulbs are color-matched against. Sending hue/sat instead is only an
// approximation. The bridge clamps xy to each bulb's gamut itself.
export function rgbToXy({ r, g, b }) {
    const lin = (c) => { const n = c / 255; return n > 0.04045 ? ((n + 0.055) / 1.055) ** 2.4 : n / 12.92; };
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
    const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
    const Z = R * 0.000088 + G * 0.07231 + B * 0.986039;
    const sum = X + Y + Z;
    if (!sum) return [0.3127, 0.329];               // black: D65 white point
    return [+(X / sum).toFixed(4), +(Y / sum).toFixed(4)];
}

// ---- recent colors (per device: a convenience, fine to lose) ----
const RECENT_KEY = 'recent_light_colors';
export function getRecentColors() {
    try { return (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter((h) => hexToRgb(h)); } catch { return []; }
}
export function addRecentColor(rgb) {
    const hex = rgbToHex(rgb);
    const next = [hex, ...getRecentColors().filter((h) => h !== hex)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
}

export const PRESETS = [
    { name: 'Red', hex: '#ff0000' }, { name: 'Orange', hex: '#ff7a00' }, { name: 'Yellow', hex: '#ffd400' },
    { name: 'Green', hex: '#00ff40' }, { name: 'Cyan', hex: '#00e5ff' }, { name: 'Blue', hex: '#0040ff' },
    { name: 'Purple', hex: '#8a2be2' }, { name: 'Pink', hex: '#ff3fa4' }, { name: 'White', hex: '#ffffff' },
];
// Same colors Game Day uses (backend/lib/teams.js)
export const TEAM_COLORS = [
    { name: 'Lions blue', hex: '#0076b6' }, { name: 'Lions silver', hex: '#b0b7bc' },
    { name: 'Maize', hex: '#ffcb05' }, { name: 'Michigan blue', hex: '#00274c' },
    { name: 'Pistons red', hex: '#c8102e' }, { name: 'Pistons blue', hex: '#1d42ba' },
    { name: 'Barça garnet', hex: '#a50044' }, { name: 'Barça blue', hex: '#004d98' },
];
