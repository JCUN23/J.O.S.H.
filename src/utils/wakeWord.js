// Wake-word helpers (pure; unit-tested in wakeWord.test.js)

// True when a final result right after the wake word is just the wake word coming back
// (Android re-finalizes the last utterance, sometimes misheard), not a real command.
const WAKE_ECHO_MS = 1500;
const WAKE_SOUNDALIKE = /^(hey |ok |okay )?(sentinel|sentinal|sentinels|centennial|sentence|send it in all|sent in all|sentimental)[\s.,!?]*$/i;
const normalizeSpeech = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export function isWakeEcho(transcript, wakeTranscript, wakeAt, now = Date.now()) {
    const t = normalizeSpeech(transcript);
    if (t.length < 3) return true;                                 // noise
    if (WAKE_SOUNDALIKE.test(t)) return true;                       // "sentinel" again / misheard
    const recent = now - wakeAt < WAKE_ECHO_MS;
    return recent && t === normalizeSpeech(wakeTranscript);         // same utterance re-sent
}
