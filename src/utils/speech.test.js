import { describe, it, expect } from 'vitest';
import { forSpeech } from './speech';

describe('forSpeech', () => {
    it('says units like a person', () => {
        expect(forSpeech('High of 54°F with a low of 45°F.')).toBe('High of 54 degrees with a low of 45 degrees.');
        expect(forSpeech('Nozzle 220°C, 40% done, wind 12 mph')).toBe('Nozzle 220 degrees Celsius, 40 percent done, wind 12 miles per hour');
        expect(forSpeech('-3 °F tonight')).toBe('-3 degrees tonight');
        expect(forSpeech('No numbers here.')).toBe('No numbers here.');
    });
});
