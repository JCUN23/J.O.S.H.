// Text -> what a voice should say. TTS reads symbols literally ("54°F" came out as
// "54 deg F", Nov 9). Mirrored in src/utils/speech.js for the panel's browser voice.
function forSpeech(text) {
  return String(text ?? '')
    .replace(/(-?\d+(?:\.\d+)?)\s*°\s*F\b/g, '$1 degrees')
    .replace(/(-?\d+(?:\.\d+)?)\s*°\s*C\b/g, '$1 degrees Celsius')
    .replace(/(\d)\s*°/g, '$1 degrees')
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/(\d)\s*mph\b/gi, '$1 miles per hour')
    .replace(/(\d)\s*km\/h\b/gi, '$1 kilometers per hour');
}
module.exports = { forSpeech };
