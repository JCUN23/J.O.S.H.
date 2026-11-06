import { describe, it, expect } from 'vitest';
import { isWakeEcho } from './wakeWord';

const wokeAt = 1_000_000;
describe('isWakeEcho (regression: tablet answered before the user spoke)', () => {
  it('treats the wake word coming back as an echo, not a command', () => {
    for (const t of ['Sentinel', 'sentinel.', 'Hey Sentinel', 'sentinal', 'centennial', 'sent in all', '', 'uh']) {
      expect(isWakeEcho(t, 'Sentinel', wokeAt, wokeAt + 400)).toBe(true);
    }
  });
  it('treats the same utterance re-sent right after waking as an echo', () => {
    expect(isWakeEcho('Sentinel hello', 'sentinel hello', wokeAt, wokeAt + 300)).toBe(true);
  });
  it('lets a real command through, even immediately', () => {
    expect(isWakeEcho('turn off the lights', 'Sentinel', wokeAt, wokeAt + 300)).toBe(false);
    expect(isWakeEcho("what's the weather", 'Sentinel', wokeAt, wokeAt + 5000)).toBe(false);
  });
  it('a repeat of the wake phrase much later is a command again', () => {
    expect(isWakeEcho('sentinel hello', 'sentinel hello', wokeAt, wokeAt + 5000)).toBe(false);
  });
});
