import { describe, it, expect } from 'vitest';
import { rgbToHex, hexToRgb, hsvToRgb, rgbToHsv, rgbToXy, addRecentColor, getRecentColors } from './color';

describe('color math', () => {
    it('hex round-trips, accepts short form, rejects junk', () => {
        expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
        expect(hexToRgb('f80')).toEqual({ r: 255, g: 136, b: 0 });
        expect(hexToRgb('#zzz')).toBeNull();
        expect(rgbToHex({ r: 0, g: 118, b: 182 })).toBe('#0076b6');
        expect(rgbToHex({ r: 300, g: -4, b: 12.6 })).toBe('#ff000d');
    });

    it('hsv <-> rgb', () => {
        expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
        expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
        expect(hsvToRgb({ h: 240, s: 0, v: 1 })).toEqual({ r: 255, g: 255, b: 255 });
        const back = hsvToRgb(rgbToHsv({ r: 0, g: 118, b: 182 }));
        expect(back).toEqual({ r: 0, g: 118, b: 182 });
    });

    it('rgb -> Hue xy matches Philips reference points', () => {
        const [rx, ry] = rgbToXy({ r: 255, g: 0, b: 0 });
        expect(rx).toBeCloseTo(0.7006, 3); expect(ry).toBeCloseTo(0.2993, 3);
        const [wx, wy] = rgbToXy({ r: 255, g: 255, b: 255 });
        expect(wx).toBeCloseTo(0.3227, 3); expect(wy).toBeCloseTo(0.329, 3);
        expect(rgbToXy({ r: 0, g: 0, b: 0 })).toEqual([0.3127, 0.329]);
    });

    it('recent colors: newest first, deduped, max 8', () => {
        localStorage.clear();
        for (let i = 0; i < 10; i++) addRecentColor({ r: i, g: 0, b: 0 });
        addRecentColor({ r: 3, g: 0, b: 0 });
        const recent = getRecentColors();
        expect(recent).toHaveLength(8);
        expect(recent[0]).toBe('#030000');
        expect(recent.filter((h) => h === '#030000')).toHaveLength(1);
    });
});
