import { BACKEND_URL } from '../config';

// Which device runs what the Pi mic hears. Per device; default on for the installed
// wall-panel app (standalone display mode), off in a normal browser tab (your laptop),
// so one command never runs twice.
const KEY = 'voice_panel';

const isInstalledApp = () => {
    try { return window.matchMedia('(display-mode: standalone)').matches; } catch { return false; }
};

export function getVoicePanel() {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'on') return true;
        if (v === 'off') return false;
    } catch { /* storage unavailable */ }
    return isInstalledApp();
}

export function setVoicePanel(on) {
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

// Live events from the Pi mic (backend routes/voice.js). Returns a disconnect function.
//   wake       -> the wake word was heard; show "listening"
//   transcript -> run this text as a spoken command (only sent while a voice panel is open)
//   nothing    -> heard the wake word, then no words
//   error      -> speech-to-text failed
//   announce   -> something for Alfred to say (timer done, reminder, briefing)
export function connectPiVoice({ onWake, onTranscript, onNothing, onError, onAnnounce, onIdle, onStop } = {}) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource(`${BACKEND_URL}/api/voice/events?panel=1`);
    const done = new Set();                                  // command ids already run
    es.onmessage = (e) => {
        let ev;
        try { ev = JSON.parse(e.data); } catch { return; }
        if (ev.id != null) { if (done.has(ev.id)) return; done.add(ev.id); }
        if (ev.type === 'wake') onWake?.();
        else if (ev.type === 'transcript' && ev.text) onTranscript?.(ev.text);
        else if (ev.type === 'nothing') onNothing?.();
        else if (ev.type === 'idle') onIdle?.();                     // follow-up window ended in silence
        else if (ev.type === 'error') onError?.(ev.text || 'Pi mic error');
        else if (ev.type === 'announce' && ev.text) onAnnounce?.(ev.text);   // timers, reminders, briefings
        else if (ev.type === 'stop') onStop?.();                             // "Alfred" said over him: hush
    };
    return () => es.close();
}

// While Sentinel talks, the Pi ignores wake words (its own voice must not wake it).
// followup: false = don't open a follow-up listening window (music just started).
export const reportSpeaking = (speaking, { followup } = {}) =>
    fetch(`${BACKEND_URL}/api/voice/speaking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(followup === undefined ? { speaking } : { speaking, followup }),
    }).catch(() => {});
