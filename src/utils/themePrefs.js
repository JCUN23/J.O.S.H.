// Theme color (the Color button), remembered per device: a refresh keeps it, and the face
// lock, which shows before anything else, uses it too (it used to reset to cyan).
export const THEMES = ['cyan', 'yellow', 'mocha'];
const KEY = 'hud_theme';

export function getTheme(fallback) {
    try { const t = localStorage.getItem(KEY); if (THEMES.includes(t)) return t; } catch { /* storage unavailable */ }
    return THEMES.includes(fallback) ? fallback : 'cyan';
}

export function saveTheme(theme) {
    try { if (THEMES.includes(theme)) localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
}
