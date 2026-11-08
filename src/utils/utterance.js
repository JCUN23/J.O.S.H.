// Turns Chrome's speech segments into one command. Chrome (Android especially) marks a
// segment "final" at any short pause, so acting on the first final cut people off mid-
// sentence ("turn on... the lights" sent just "turn on", and the AI replied that it
// didn't catch that). Collect finals, show interim text, and only finish after a beat of
// silence. Fragments shorter than minLength (a stray "uh") are dropped.
export const END_OF_SPEECH_MS = 1300;

// Join two pieces of speech without repeating words. Desktop Chrome sends separate pieces
// ("turn on" + "the lights"); Android in continuous mode re-sends what it already said
// ("turn on" + "turn on the lights"). Overlap = longest end of `a` that starts `b`.
const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
export function mergeSpeech(a = '', b = '') {
    const A = a.split(/\s+/).filter(Boolean);
    const B = b.split(/\s+/).filter(Boolean);
    if (!A.length) return B.join(' ');
    if (!B.length) return A.join(' ');
    const a2 = A.map(norm);
    const b2 = B.map(norm);
    for (let k = Math.min(A.length, B.length); k > 0; k--) {
        if (a2.slice(-k).join(' ') === b2.slice(0, k).join(' ')) return [...A, ...B.slice(k)].join(' ');
    }
    // `b` already contains all of `a` further in (cumulative engine restating it): take `b`
    if (b2.join(' ').includes(a2.join(' '))) return B.join(' ');
    return [...A, ...B].join(' ');
}

export function createUtterance({ onDone, delayMs = END_OF_SPEECH_MS, minLength = 3 }) {
    let finals = '';
    let partial = '';
    let timer = null;
    const text = () => mergeSpeech(finals, partial);
    const fire = () => {
        timer = null;
        const t = text();            // a last interim counts: some engines never finalize it
        finals = ''; partial = '';
        if (t.length >= minLength) onDone(t);
    };
    return {
        // final: newly finished words; partial: the words still being recognized
        push({ final = '', partial: p = '' } = {}) {
            if (final.trim()) finals = mergeSpeech(finals, final);
            partial = p;
            clearTimeout(timer);
            timer = setTimeout(fire, delayMs);
            return text();
        },
        cancel() { clearTimeout(timer); timer = null; finals = ''; partial = ''; },
        pending: () => timer !== null,
    };
}
