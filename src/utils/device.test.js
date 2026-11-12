import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isPhone, isWallPanel } from './device';
import { getVoicePanel } from './piVoice';
import { getIdleEnabled } from './idlePrefs';

const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
    tabS7: 'Mozilla/5.0 (Linux; Android 14; SM-T970) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    pixel: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15',
};
const as = (ua, installed) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    window.matchMedia = () => ({ matches: installed });
};

describe('per-device defaults (Nov 11: the iPhone app)', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('phones vs tablets', () => {
        as(UA.iphone, true); expect(isPhone()).toBe(true);
        as(UA.pixel, true); expect(isPhone()).toBe(true);
        as(UA.tabS7, true); expect(isPhone()).toBe(false);
        as(UA.mac, false); expect(isPhone()).toBe(false);
    });

    it('the installed tablet is the wall panel: voice panel + idle screen on', () => {
        as(UA.tabS7, true);
        expect(isWallPanel()).toBe(true);
        expect(getVoicePanel()).toBe(true);
        expect(getIdleEnabled()).toBe(true);
    });

    it('the iPhone home-screen app is NOT: Pi commands stay on the wall, no idle screen', () => {
        as(UA.iphone, true);
        expect(isWallPanel()).toBe(false);
        expect(getVoicePanel()).toBe(false);
        expect(getIdleEnabled()).toBe(false);
    });

    it('a choice made on the device still wins', () => {
        as(UA.iphone, true);
        localStorage.setItem('voice_panel', 'on');
        expect(getVoicePanel()).toBe(true);
    });
});
