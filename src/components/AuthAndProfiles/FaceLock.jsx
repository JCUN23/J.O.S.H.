import { useEffect, useState, useRef } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useProfile } from './ProfileContext.jsx';
const FaceLock = ({ isLocked, onUnlock, theme = 'cyan' }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [verificationLog, setVerificationLog] = useState([]);
    const [isVerifying, setIsVerifying] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [registeredFaces, setRegisteredFaces] = useState([]);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const faceApiRef = useRef(null);
    const verifyIntervalRef = useRef(null);

    const { loginProfile } = useProfile();

    /* -------------------- LOGGING -------------------- */
    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setVerificationLog(prev => [...prev.slice(-4), { time: timestamp, message, type }]);
    };

    /* -------------------- LOAD MODELS -------------------- */
    useEffect(() => {
        const loadModels = async () => {
            try {
                addLog('Initializing face recognition system...');
                if (!window.faceapi) {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
                    script.async = true;
                    document.body.appendChild(script);
                    await new Promise((res, rej) => {
                        script.onload = res;
                        script.onerror = rej;
                    });
                }

                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
                await Promise.all([
                    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
                ]);

                faceApiRef.current = window.faceapi;
                const faces = JSON.parse(localStorage.getItem('registered_faces') || '[]');
                setRegisteredFaces(faces);
                setIsLoading(false);
            } catch (err) {
                addLog(`Model load error: ${err.message}`, 'error');
                setIsLoading(false);
            }
        };

        loadModels();
    }, []);

    /* -------------------- VERIFICATION -------------------- */
    const startVerification = async () => {
        if (isVerifying || !faceApiRef.current || !videoRef.current) return;

        setIsVerifying(true);
        addLog('Starting face verification...');

        const verify = async () => {
            try {
                const faces = JSON.parse(localStorage.getItem('registered_faces') || '[]');
                if (!faces.length) return;

                const detection = await faceApiRef.current
                    .detectSingleFace(videoRef.current, new faceApiRef.current.TinyFaceDetectorOptions())
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detection) return;

                let best = { match: null, dist: Infinity };

                faces.forEach(face => {
                    const d = faceApiRef.current.euclideanDistance(
                        detection.descriptor,
                        face.descriptor
                    );
                    if (d < best.dist) best = { match: face, dist: d };
                });

                if (best.dist < 0.6) {
                    addLog(`✓ MATCH: ${best.match.name}`, 'success');
                    setStatus(`IDENTITY CONFIRMED`);
                    setTimeout(() => setStatus(`WELCOME, ${best.match.name.toUpperCase()}`), 400);
                    setTimeout(() => setStatus(`BOOTING PROFILE SYSTEMS...`), 800);

                    // Load the matched profile
                    loginProfile({ name: best.match.name, ...best.match });

                    clearInterval(verifyIntervalRef.current);
                    streamRef.current?.getTracks().forEach(t => t.stop());
                    onUnlock();
                }
            } catch (err) {
                addLog(`Verification error: ${err.message}`, 'error');
            }
        };

        verify();
        verifyIntervalRef.current = setInterval(verify, 1000);
        setIsVerifying(false);
    };

    /* -------------------- CAMERA -------------------- */
    useEffect(() => {
        if (!isLocked || isLoading) return;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                startVerification();
            } catch (err) {
                addLog('Camera access denied', err);
            }
        };

        startCamera();

        return () => {
            clearInterval(verifyIntervalRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLocked, isLoading]);

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
            <div className={`bg-${theme}-950 border border-${theme}-700 rounded-lg p-8 max-w-xl w-full`}>
                <div className="flex items-center gap-3 mb-4 justify-center">
                    <Lock className={`text-${theme}-400`} />
                    <h2 className={`text-${theme}-300 text-2xl font-mono`}>SYSTEM LOCKED</h2>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center">
                        <Loader2 className={`animate-spin text-${theme}-400`} size={48} />
                        <p className={`text-${theme}-500`}>{status}</p>
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className={`w-full border border-${theme}-700 rounded mb-3`}
                        />

                        <p className={`text-center text-${theme}-400 mb-2`}>{status}</p>

                        <div className={`bg-black/60 border border-${theme}-800 rounded p-2 text-xs font-mono`}>
                            {verificationLog.map((l, i) => (
                                <div key={i} className={l.type === 'error' ? 'text-red-500' :
                                    l.type === 'success' ? 'text-green-500' :
                                        `text-${theme}-500`}>
                                    [{l.time}] {l.message}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default FaceLock;
