import { useState } from 'react';
import { Music, Lightbulb, Cpu, TrendingUp, UserCheck } from 'lucide-react';
import FaceManagement from './AuthAndProfiles/FaceManagement';
import BluetoothWidget from "./BluetoothWidget";

// Quick Controls Component
const QuickControls = ({ theme }) => {

    const [showFaceManagement, setShowFaceManagement] = useState(false);
    const [showBluetooth, setShowBluetooth] = useState(false);

    return (
        <>
            <div className={`col-span-12 md:col-span-6 bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px] max-h-80 overflow-hidden`}>
                <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className={`text-${theme}-400`} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>QUICK CONTROLS</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button className={`bg-black/50 border border-${theme}-800 rounded p-4 hover:border-${theme}-600 hover:bg-${theme}-900/20 transition-all"}`}>
                        <Cpu size={24} className={`mx-auto mb-2 text-${theme}-400`} />
                        <div className={`text-${theme}-700 text-sm`}>Arduino</div>
                        <div className={`text-${theme}-700`}>Not Connected</div>
                    </button>
                    {/* Face Management */}
                    <button
                        onClick={() => setShowFaceManagement(true)}
                        className={`bg-black/50 border border-${theme}-800 rounded p-4 hover:border-${theme}-600 hover:bg-${theme}-900/20 transition-all`}
                    >
                        <UserCheck size={24} className={`mx-auto mb-2 text-${theme}-400`} />
                        <div className={`text-sm text-${theme}-400`}>Face Lock</div>
                        <div className={`text-xs text-${theme}-700`}>Settings</div>
                    </button>
                </div>
            </div>

            {showFaceManagement && (
                <FaceManagement onClose={() => setShowFaceManagement(false)} />
            )}
            {showBluetooth && (
                <BluetoothWidget
                    theme={theme}
                    onClose={() => setShowBluetooth(false)}
                />
            )}

        </>
    );
};

export default QuickControls;