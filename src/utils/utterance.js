// Turns Chrome's speech segments into one command. Chrome (Android especially) marks a
// segment "final" at any short pause, so acting on the first final cut people off mid-
// sentence ("turn on... the lights" sent just "turn on", and the AI replied that it
// didn't catch that). Collect finals, show interim text, and only finish after a beat of
// silence. Fragments shorter than minLength (a stray "uh") are dropped.
export const END_OF_SPEECH_MS = 1300;

export function createUtterance({ onDone, delayMs = END_OF_SPEECH_MS, minLength = 3 }) {
    let finals = '';
    let partial = '';
    let timer = null;
    const text = () => `${finals} ${partial}`.replace(/\s+/g, ' ').trim();
    const fire = () => {
        timer = null;
        const t = text();            // a last interim counts: some engines never finalize it
        finals = ''; partial = '';
        if (t.length >= minLength) onDone(t);
    };
    return {
        // final: newly finished words; partial: the words still being recognized
        push({ final = '', partial: p = '' } = {}) {
            if (final.trim()) finals = `${finals} ${final}`;
            partial = p;
            clearTimeout(timer);
            timer = setTimeout(fire, delayMs);
            return text();
        },
        cancel() { clearTimeout(timer); timer = null; finals = ''; partial = ''; },
        pending: () => timer !== null,
    };
}
