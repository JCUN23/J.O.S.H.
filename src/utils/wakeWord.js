// Wake-word helpers (pure; unit-tested in wakeWord.test.js)

// True when a final result right after the wake word is just the wake word coming back
// (Android re-finalizes the last utterance, sometimes misheard), not a real command.
const WAKE_ECHO_MS = 1500;
const WAKE_SOUNDALIKE = /^(hey |ok |okay )?(alfred|al fred|alfreds|sentinel|sentinal|sentinels|centennial|sentence|send it in all|sent in all|sentimental)[\s.,!?]*$/i;
const normalizeSpeech = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export function isWakeEcho(transcript, wakeTranscript, wakeAt, now = Date.now()) {
    const t = normalizeSpeech(transcript);
    if (t.length < 3) return true;                                 // noise
    if (WAKE_SOUNDALIKE.test(t)) return true;                       // "sentinel" again / misheard
    const recent = now - wakeAt < WAKE_ECHO_MS;
    return recent && t === normalizeSpeech(wakeTranscript);         // same utterance re-sent
}

// The panel's own wake word: "Alfred" (same as the Pi mic); "Sentinel" still works.
// -> the command after it | null (wake word alone: command comes next) | false (no wake word)
const WAKE = '(?:hey |ok |okay )?(?:alfred|sentinel)';
export function extractCommand(text) {
    const lower = String(text || '').toLowerCase();
    const m = lower.match(new RegExp(`\\b${WAKE}[,.!]?\\s+(.+)`, 'i'));
    if (m && m[1].trim()) return m[1].trim();
    return new RegExp(`\\b${WAKE}\\b`, 'i').test(lower) ? null : false;
}
