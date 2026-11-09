import { describe, it, expect, beforeEach } from 'vitest';
import { getTheme, saveTheme } from './themePrefs';

describe('theme color survives a refresh', () => {
    beforeEach(() => localStorage.clear());
    it('remembers the chosen color; ignores junk; falls back to the profile, then cyan', () => {
        expect(getTheme()).toBe('cyan');
        expect(getTheme('mocha')).toBe('mocha');
        saveTheme('yellow');
        expect(getTheme('mocha')).toBe('yellow');
        saveTheme('purple');
        expect(getTheme()).toBe('yellow');
        localStorage.setItem('hud_theme', 'nonsense');
        expect(getTheme()).toBe('cyan');
    });
});
