import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Lightbulb, LightbulbOff, UserCheck, Loader2 } from 'lucide-react';
import FaceManagement from './AuthAndProfiles/FaceManagement';
import { allLights } from '../utils/sentinelLocal';

// Quick Controls: every light on/off (Govee + Hue, the same path Alfred uses) and face lock.
const QuickControls = ({ theme }) => {
    const [showFaceManagement, setShowFaceManagement] = useState(false);
    const [busy, setBusy] = useState(null);       // 'on' | 'off'
    const [msg, setMsg] = useState('');

    const lights = async (on) => {
        setBusy(on ? 'on' : 'off'); setMsg('');
        const r = await allLights(on, [on ? 'All lights on.' : 'All lights off.']);
        setMsg(r.response);
        setBusy(null);
    };
    const tile = `bg-black/50 border border-${theme}-800 rounded p-4 hover:border-${theme}-600 hover:bg-${theme}-900/20 transition-all disabled:opacity-50`;

    return (
        <>
            <div className={`col-span-12 md:col-span-6 bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px] max-h-80 overflow-hidden`}>
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>QUICK CONTROLS</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => lights(true)} disabled={!!busy} className={tile}>
                        {busy === 'on' ? <Loader2 size={24} className={`mx-auto mb-2 animate-spin text-${theme}-400`} /> : <Lightbulb size={24} className={`mx-auto mb-2 text-${theme}-400`} />}
                        <div className={`text-sm text-${theme}-400`}>All lights</div>
                        <div className={`text-xs text-${theme}-700`}>On</div>
                    </button>
                    <button onClick={() => lights(false)} disabled={!!busy} className={tile}>
                        {busy === 'off' ? <Loader2 size={24} className={`mx-auto mb-2 animate-spin text-${theme}-400`} /> : <LightbulbOff size={24} className={`mx-auto mb-2 text-${theme}-400`} />}
                        <div className={`text-sm text-${theme}-400`}>All lights</div>
                        <div className={`text-xs text-${theme}-700`}>Off</div>
                    </button>
                    <button onClick={() => setShowFaceManagement(true)} className={`${tile} col-span-2`}>
                        <UserCheck size={24} className={`mx-auto mb-2 text-${theme}-400`} />
                        <div className={`text-sm text-${theme}-400`}>Face Lock</div>
                        <div className={`text-xs text-${theme}-700`}>Settings</div>
                    </button>
                </div>
                {msg && <div className={`mt-3 text-xs text-${theme}-500`} role="status">{msg}</div>}
            </div>

            {showFaceManagement && (
                // Portal to <body> so the full-screen modal escapes the card's
                // containing block (backdrop-filter/transform on ancestors would trap position: fixed).
                createPortal(<FaceManagement onClose={() => setShowFaceManagement(false)} onRegistered={() => setShowFaceManagement(false)} />, document.body)
            )}
        </>
    );
};

export default QuickControls;
