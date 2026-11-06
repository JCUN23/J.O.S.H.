// One shared copy of face-api (FaceLock + idle-mode wake). Loading the script or a model
// twice would download it twice, so both go through these memoized promises.
const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
export const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

let scriptPromise = null;
let detectorPromise = null;

export function loadFaceApi() {
    if (window.faceapi) return Promise.resolve(window.faceapi);
    scriptPromise ||= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve(window.faceapi);
        script.onerror = () => { scriptPromise = null; reject(new Error('face-api failed to load')); };
        document.body.appendChild(script);
    });
    return scriptPromise;
}

// Just the tiny detector: "is there a face?", no recognition. Cheap enough to run every ~1.5s.
export function loadFaceDetector() {
    detectorPromise ||= loadFaceApi().then(async (faceapi) => {
        if (!faceapi.nets.tinyFaceDetector.isLoaded) await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
        return faceapi;
    }).catch((err) => { detectorPromise = null; throw err; });
    return detectorPromise;
}
