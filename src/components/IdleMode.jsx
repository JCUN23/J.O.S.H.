import { useEffect, useRef, useState } from 'react';
import { loadFaceDetector } from '../utils/faceApiLoader';
import { WAKE_EVENT, ARRIVED_EVENT, IDLE_NOW_EVENT } from '../utils/idlePrefs';
import IdleCave from './IdleCave';

const TICKS = Array.from({ length: 60 }, (_, i) => i);

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const wake = () => window.dispatchEvent(new Event(WAKE_EVENT));
// Leaving the idle screen because someone showed up (face or tap): the cue for Alfred's
// morning briefing / welcome home. Voice and alerts wake the panel without it.
const arrived = () => { window.dispatchEvent(new Event(ARRIVED_EVENT)); wake(); };

// After `minutes` without a touch, the panel fades to a dim clock in an animated batcave.
// Wakes on touch, on the wake word (WAKE_EVENT), or when the camera sees any face.
// The clock drifts a little every minute so nothing sits still on the AMOLED screen.
// The parent remounts this (key) when it pauses, so a stale idle state never reappears.
const IdleMode = ({ enabled, paused, minutes = 3, theme }) => {
    const [idle, setIdle] = useState(false);
    const [now, setNow] = useState(() => new Date());
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [note, setNote] = useState('');
    const videoRef = useRef(null);
    const active = enabled && !paused;

    // Inactivity timer
    useEffect(() => {
        if (!active) return undefined;
        let timer;
        const arm = () => { clearTimeout(timer); timer = setTimeout(() => setIdle(true), minutes * 60000); };
        const onWake = () => { setIdle(false); arm(); };
        const idleNow = () => { clearTimeout(timer); setTimeout(() => setIdle(true), 1500); };   // after Alfred's reply
        ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, arm, { passive: true }));
        window.addEventListener(WAKE_EVENT, onWake);
        window.addEventListener(IDLE_NOW_EVENT, idleNow);
        arm();
        return () => {
            clearTimeout(timer);
            ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, arm));
            window.removeEventListener(WAKE_EVENT, onWake);
            window.removeEventListener(IDLE_NOW_EVENT, idleNow);
        };
    }, [active, minutes]);

    // Clock + burn-in drift while idle
    useEffect(() => {
        if (!idle) return undefined;
        const clock = setInterval(() => setNow(new Date()), 10000);
        const drift = setInterval(() => setOffset({ x: Math.round((Math.random() - 0.5) * 80), y: Math.round((Math.random() - 0.5) * 50) }), 60000);
        return () => { clearInterval(clock); clearInterval(drift); };
    }, [idle]);

    // Camera wake: tiny face detector on a 320x240 stream, only while idle
    useEffect(() => {
        if (!idle) return undefined;
        let alive = true;
        let stream = null;
        let timer = null;
        (async () => {
            try {
                const faceapi = await loadFaceDetector();
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
                if (!alive) return;
                const video = videoRef.current;
                video.srcObject = stream;
                await video.play();
                const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 });
                timer = setInterval(async () => {
                    if (document.hidden || !alive) return;
                    try { if (await faceapi.detectSingleFace(video, opts)) arrived(); } catch { /* frame not ready */ }
                }, 1500);
            } catch {
                if (alive) setNote('Tap anywhere to wake');
            }
        })();
        return () => {
            alive = false;
            clearInterval(timer);
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, [idle]);

    if (!active || !idle) return null;

    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '');
    const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    return (
        <div
            data-hud={theme}
            role="button"
            aria-label="Wake the panel"
            onPointerDown={arrived}
            className="idle-root fixed inset-0 z-[200] bg-black select-none overflow-hidden"
        >
            <IdleCave />
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, transition: 'transform 4s ease-in-out' }}>
                <div className="idle-dial">
                    <svg className="idle-ring" viewBox="0 0 200 200" aria-hidden="true">
                        <circle cx="100" cy="100" r="96" className="idle-ring-outer" />
                        <g className="idle-ring-ticks">
                            {TICKS.map((i) => (
                                <line key={i} x1="100" y1={i % 5 ? 7 : 4} x2="100" y2="10" transform={`rotate(${i * 6} 100 100)`}
                                    className={i % 5 ? 'idle-tick' : 'idle-tick-major'} />
                            ))}
                        </g>
                        <circle cx="100" cy="100" r="88" className="idle-ring-dash" />
                        <circle cx="100" cy="100" r="92" className="idle-ring-sweep" pathLength="100" />
                    </svg>
                    <div className="idle-face">
                        <div className="idle-clock tabular-nums">{time}</div>
                        <div className="idle-date">{date}</div>
                        <div className="idle-status">SENTINEL // STANDBY</div>
                    </div>
                </div>
            </div>
            {note && <div className="absolute bottom-6 inset-x-0 text-center text-[10px] text-gray-600 tracking-[0.3em] uppercase">{note}</div>}
            <video ref={videoRef} muted playsInline className="absolute w-px h-px opacity-0 pointer-events-none" />
        </div>
    );
};

export default IdleMode;
