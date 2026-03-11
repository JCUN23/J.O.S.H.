import { useState } from 'react';
import { UserCheck, Shield, Key, ArrowRight, CheckCircle } from 'lucide-react';
import FaceManagement from './FaceManagement';

const OnboardingScreen = ({ onComplete }) => {
    const [step, setStep] = useState(1); // 1: welcome, 2: pin setup, 3: face setup
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showFaceSetup, setShowFaceSetup] = useState(false);

    const handlePinSubmit = () => {
        if (pin.length !== 4) {
            setPinError('PIN must be 4 digits');
            return;
        }
        if (pin !== confirmPin) {
            setPinError('PINs do not match');
            return;
        }
        
        // Save PIN
        localStorage.setItem('backup_pin', pin);
        localStorage.setItem('pin_enabled', 'true');
        
        // Move to face setup
        setStep(3);
    };

    const handleSkipFace = () => {
        localStorage.setItem('onboarding_completed', 'true');
        onComplete();
    };

    const handleFaceSetupComplete = () => {
        localStorage.setItem('onboarding_completed', 'true');
        onComplete();
    };

    if (showFaceSetup) {
        return <FaceManagement onClose={handleFaceSetupComplete} isOnboarding={true} />;
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
            <div className="bg-gradient-to-br from-cyan-950 to-blue-950 border-2 border-cyan-700 rounded-lg p-8 max-w-2xl w-full mx-4">
                
                {/* Welcome Screen */}
                {step === 1 && (
                    <>
                        <div className="text-center mb-8">
                            <div className="text-6xl font-bold text-cyan-400 mb-4 font-mono">J.O.S.H.</div>
                            <div className="text-2xl text-cyan-300 mb-2 font-mono">Joint Operations & Systems Hub</div>
                            <div className="text-cyan-600 font-mono">Your Smart Office Command Center</div>
                        </div>

                        <div className="bg-black/50 border border-cyan-800 rounded-lg p-6 mb-6">
                            <h3 className="text-xl font-bold text-cyan-300 mb-4 font-mono">Initial Setup</h3>
                            <p className="text-cyan-500 mb-4">
                                Welcome to your smart hub! Let's set up security for your installation.
                            </p>
                            <div className="space-y-3 text-sm text-cyan-600">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="text-cyan-400 flex-shrink-0" size={20} />
                                    <span>Configure backup PIN for emergency access</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="text-cyan-400 flex-shrink-0" size={20} />
                                    <span>Set up facial recognition (optional)</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="text-cyan-400 flex-shrink-0" size={20} />
                                    <span>Control Spotify, weather, sports, and more</span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-4 rounded-lg transition-all font-mono font-semibold text-lg"
                        >
                            Get Started
                            <ArrowRight size={24} />
                        </button>
                    </>
                )}

                {/* PIN Setup */}
                {step === 2 && (
                    <>
                        <div className="text-center mb-8">
                            <Key className="text-cyan-400 mx-auto mb-4" size={64} />
                            <h2 className="text-3xl font-bold text-cyan-300 mb-2 font-mono">Set Backup PIN</h2>
                            <p className="text-cyan-600 font-mono">For emergency access if face unlock fails</p>
                        </div>

                        <div className="bg-black/50 border border-cyan-800 rounded-lg p-6 mb-6">
                            <p className="text-cyan-500 mb-6 text-sm">
                                This PIN will be your backup authentication method. You'll need it if:
                            </p>
                            <ul className="text-cyan-600 text-sm space-y-2 mb-6">
                                <li>• Face recognition isn't working</li>
                                <li>• Camera is unavailable</li>
                                <li>• Browser data is cleared</li>
                            </ul>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-cyan-400 mb-2 font-mono text-sm">Enter 4-Digit PIN</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={4}
                                        value={pin}
                                        onChange={(e) => {
                                            setPin(e.target.value.replace(/\D/g, ''));
                                            setPinError('');
                                        }}
                                        className="w-full bg-black/50 border border-cyan-800 rounded px-4 py-3 text-cyan-300 font-mono text-center text-2xl tracking-widest focus:outline-none focus:border-cyan-600"
                                        placeholder="••••"
                                    />
                                </div>
                                <div>
                                    <label className="block text-cyan-400 mb-2 font-mono text-sm">Confirm PIN</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={4}
                                        value={confirmPin}
                                        onChange={(e) => {
                                            setConfirmPin(e.target.value.replace(/\D/g, ''));
                                            setPinError('');
                                        }}
                                        className="w-full bg-black/50 border border-cyan-800 rounded px-4 py-3 text-cyan-300 font-mono text-center text-2xl tracking-widest focus:outline-none focus:border-cyan-600"
                                        placeholder="••••"
                                    />
                                </div>
                                {pinError && (
                                    <p className="text-red-400 text-sm font-mono">{pinError}</p>
                                )}
                            </div>
                        </div>

                        <button
                            onClick={handlePinSubmit}
                            disabled={pin.length !== 4 || confirmPin.length !== 4}
                            className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-4 rounded-lg transition-all font-mono font-semibold text-lg"
                        >
                            Continue to Face Setup
                            <ArrowRight size={24} />
                        </button>
                    </>
                )}

                {/* Face Setup Option */}
                {step === 3 && (
                    <>
                        <div className="text-center mb-8">
                            <Shield className="text-cyan-400 mx-auto mb-4" size={64} />
                            <h2 className="text-3xl font-bold text-cyan-300 mb-2 font-mono">Facial Recognition</h2>
                            <p className="text-cyan-600 font-mono">Optional but recommended for convenience</p>
                        </div>

                        <div className="bg-black/50 border border-cyan-800 rounded-lg p-6 mb-6">
                            <div className="space-y-3 text-sm text-cyan-500">
                                <p>✓ PIN backup configured</p>
                                <p className="mb-4">Now set up face unlock for quick, hands-free access:</p>
                                <ul className="text-cyan-600 space-y-2">
                                    <li>• Unlock with a glance</li>
                                    <li>• Register multiple authorized faces</li>
                                    <li>• All data stored locally</li>
                                    <li>• PIN always available as backup</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowFaceSetup(true)}
                                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-4 rounded-lg transition-all font-mono font-semibold text-lg"
                            >
                                <UserCheck size={24} />
                                Set Up Face Unlock
                            </button>
                            <button
                                onClick={handleSkipFace}
                                className="flex-1 flex items-center justify-center gap-2 bg-cyan-900 hover:bg-cyan-800 border border-cyan-700 text-cyan-300 px-6 py-4 rounded-lg transition-all font-mono"
                            >
                                Skip for Now
                            </button>
                        </div>
                        
                        <p className="text-center text-xs text-cyan-700 mt-4 font-mono">
                            You can set up face unlock later in Quick Controls → Face Lock Settings
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default OnboardingScreen;