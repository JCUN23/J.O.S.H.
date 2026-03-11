import { useEffect, useState, useRef } from 'react';
import { Camera, UserPlus, Trash2, Loader2, X } from 'lucide-react';

const FaceManagement = ({ onClose }) => {
    const [registeredFaces, setRegisteredFaces] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCapturing, setIsCapturing] = useState(false);
    const [status, setStatus] = useState('');
    const [newFaceName, setNewFaceName] = useState('');
    const [showCamera, setShowCamera] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const faceApiRef = useRef(null);

    useEffect(() => {
        const loadModels = async () => {
            try {
                setStatus('Loading AI models...');

                if (!window.faceapi) {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
                    script.async = true;
                    document.body.appendChild(script);

                    await new Promise((resolve, reject) => {
                        script.onload = resolve;
                        script.onerror = reject;
                    });
                }

                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

                await Promise.all([
                    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);

                faceApiRef.current = window.faceapi;

                // Load registered faces
                const faces = JSON.parse(localStorage.getItem('registered_faces') || '[]');
                setRegisteredFaces(faces);

                setIsLoading(false);
                setStatus('');
            } catch (error) {
                console.error('Error loading face-api:', error);
                setStatus('Error loading AI models');
                setIsLoading(false);
            }
        };

        loadModels();
    }, []);

    const startCamera = async () => {
        try {
            setStatus('Starting camera...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });

            // Keep the stream reference immediately
            streamRef.current = stream;

            // Show the camera UI so the <video> element is rendered
            setShowCamera(true);

            // Wait until the video element is mounted and videoRef.current is available
            await new Promise((resolve) => {
                const waitForVideo = () => {
                    if (videoRef.current) return resolve();
                    requestAnimationFrame(waitForVideo);
                };
                waitForVideo();
            });

            // Now that the element exists, attach the stream
            try {
                videoRef.current.srcObject = stream;
                // attempt to play (some browsers require a play call)
                videoRef.current.play?.().catch(() => { });
            } catch (err) {
                console.warn('Failed to attach stream to video element:', err);
            }

            setStatus('Position your face in the camera');
        } catch (error) {
            console.error('Camera error:', error);
            setStatus('Camera access denied');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            setShowCamera(false);
        }
    };

    const captureFace = async () => {
        if (!videoRef.current || !faceApiRef.current || !newFaceName.trim()) {
            setStatus('Please enter a name first');
            return;
        }

        try {
            setIsCapturing(true);
            setStatus('Detecting face...');

            const detection = await faceApiRef.current
                .detectSingleFace(videoRef.current, new faceApiRef.current.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setStatus('No face detected. Please position your face clearly in the camera.');
                setIsCapturing(false);
                return;
            }

            // Save face
            const newFace = {
                id: Date.now(),
                name: newFaceName.trim(),
                descriptor: Array.from(detection.descriptor),
                registeredAt: new Date().toISOString()
            };

            const updatedFaces = [...registeredFaces, newFace];
            localStorage.setItem('registered_faces', JSON.stringify(updatedFaces));
            setRegisteredFaces(updatedFaces);

            setStatus(`Face registered successfully for ${newFaceName}!`);
            setNewFaceName('');
            stopCamera();
            setIsCapturing(false);
        } catch (error) {
            console.error('Capture error:', error);
            setStatus('Capture failed. Please try again.');
            setIsCapturing(false);
        }
    };

    const deleteFace = (id) => {
        const updatedFaces = registeredFaces.filter(face => face.id !== id);
        localStorage.setItem('registered_faces', JSON.stringify(updatedFaces));
        setRegisteredFaces(updatedFaces);
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-gradient-to-br from-cyan-950 to-blue-950 border-2 border-cyan-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-cyan-300 font-mono">FACE MANAGEMENT</h2>
                    <button onClick={onClose} className="text-cyan-600 hover:text-cyan-400">
                        <X size={24} />
                    </button>
                </div>
                <div className="text-sm text-cyan-400 mb-4">
                    {registeredFaces.length === 0 ? (
                        <span className="text-yellow-400">⚠️ No faces registered. The lock feature will be disabled until you register at least one face.</span>
                    ) : (
                        <span className="text-green-400">✓ Lock enabled with {registeredFaces.length} registered face(s)</span>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <Loader2 className="animate-spin text-cyan-400" size={48} />
                        <p className="text-cyan-500 font-mono">Loading...</p>
                    </div>
                ) : (
                    <>
                        {/* Registered Faces List */}
                        <div className="mb-6">
                            <h3 className="text-lg font-semibold text-cyan-400 mb-3 font-mono">
                                Registered Faces ({registeredFaces.length})
                            </h3>
                            {registeredFaces.length === 0 ? (
                                <p className="text-cyan-600 font-mono">No faces registered yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {registeredFaces.map((face) => (
                                        <div
                                            key={face.id}
                                            className="bg-black/50 border border-cyan-800 rounded p-3 flex items-center justify-between"
                                        >
                                            <div>
                                                <div className="text-cyan-300 font-semibold font-mono">{face.name}</div>
                                                <div className="text-xs text-cyan-700 font-mono">
                                                    Registered: {new Date(face.registeredAt).toLocaleString()}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => deleteFace(face.id)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Register New Face */}
                        <div className="border-t border-cyan-800 pt-6">
                            <h3 className="text-lg font-semibold text-cyan-400 mb-3 font-mono flex items-center gap-2">
                                <UserPlus size={20} />
                                Register New Face
                            </h3>

                            {!showCamera ? (
                                <div className="space-y-4">
                                    <input
                                        type="text"
                                        value={newFaceName}
                                        onChange={(e) => setNewFaceName(e.target.value)}
                                        placeholder="Enter name (e.g., John)"
                                        className="w-full bg-black/50 border border-cyan-800 rounded px-4 py-2 text-cyan-300 font-mono focus:outline-none focus:border-cyan-600"
                                    />
                                    <button
                                        onClick={startCamera}
                                        disabled={!newFaceName.trim()}
                                        className="w-full flex items-center justify-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-all font-mono font-semibold"
                                    >
                                        <Camera size={20} />
                                        START CAMERA
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            muted
                                            playsInline
                                            className="w-full rounded-lg border-2 border-cyan-700"
                                        />
                                        <div className="absolute inset-0 pointer-events-none border-4 border-cyan-500/30 rounded-lg" />
                                    </div>

                                    <p className="text-center text-cyan-400 font-mono">{status}</p>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={captureFace}
                                            disabled={isCapturing}
                                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white px-6 py-3 rounded-lg transition-all font-mono font-semibold"
                                        >
                                            {isCapturing ? 'CAPTURING...' : 'CAPTURE FACE'}
                                        </button>
                                        <button
                                            onClick={stopCamera}
                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-all font-mono"
                                        >
                                            CANCEL
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default FaceManagement;