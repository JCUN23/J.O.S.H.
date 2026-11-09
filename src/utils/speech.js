// Text -> what a voice should say. Mirrors backend/lib/speech.js (keep them in sync).
export function forSpeech(text) {
    return String(text ?? '')
        .replace(/(-?\d+(?:\.\d+)?)\s*°\s*F\b/g, '$1 degrees')
        .replace(/(-?\d+(?:\.\d+)?)\s*°\s*C\b/g, '$1 degrees Celsius')
        .replace(/(\d)\s*°/g, '$1 degrees')
        .replace(/(\d)\s*%/g, '$1 percent')
        .replace(/(\d)\s*mph\b/gi, '$1 miles per hour')
        .replace(/(\d)\s*km\/h\b/gi, '$1 kilometers per hour');
}
