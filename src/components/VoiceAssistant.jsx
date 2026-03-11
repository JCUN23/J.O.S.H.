import React from 'react';
import { Mic, MicOff, Cpu, Loader2, Ear, EarOff } from 'lucide-react';

// Voice Assistant Component
const VoiceAssistant = ({
    listening,
    transcript,
    response,
    processing,
    toggleListening,
    onTestAI,
    theme,
    wakeWordEnabled,
    wakeWordActive,
    awaitingCommand,
    toggleWakeWordMode
}) => {
    // Determine button state and text
    const getButtonState = () => {
        if (processing) {
            return {
                text: 'PROCESSING...',
                icon: <Loader2 className="animate-spin" size={20} />,
                className: 'bg-gray-600 cursor-not-allowed text-gray-400'
            };
        }

        if (wakeWordEnabled) {
            if (awaitingCommand) {
                return {
                    text: 'LISTENING...',
                    icon: <MicOff size={20} />,
                    className: 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                };
            }
            return {
                text: 'SAY "SENTINEL"',
                icon: <Mic size={20} />,
                className: `bg-${theme}-700/50 hover:bg-${theme}-600 text-white`
            };
        }

        if (listening) {
            return {
                text: 'LISTENING...',
                icon: <MicOff size={20} />,
                className: 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
            };
        }

        return {
            text: 'ACTIVATE',
            icon: <Mic size={20} />,
            className: `bg-${theme}-700 hover:bg-${theme}-600 text-white`
        };
    };

    const buttonState = getButtonState();

    // Determine wake word indicator state
    const wakeWordIndicatorClass = wakeWordActive
        ? awaitingCommand
            ? 'bg-red-900/50 text-red-400'
            : 'bg-green-900/50 text-green-400'
        : 'bg-gray-800 text-gray-500';

    const wakeWordDotClass = wakeWordActive
        ? awaitingCommand
            ? 'bg-red-500 animate-pulse'
            : 'bg-green-500 animate-pulse'
        : 'bg-gray-600';

    const wakeWordText = wakeWordActive
        ? awaitingCommand
            ? 'AWAITING COMMAND'
            : 'LISTENING FOR "SENTINEL"'
        : 'WAKE WORD INACTIVE';

    return (
        <div className={`col-span-12 bg-gradient-to-r from-${theme}-100 to-${theme}-200 border border-${theme}-800 rounded-lg p-3 px-6`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Cpu className={`text-${theme}-400`} size={24} />
                    <h2 className={`text-xl font-semibold text-${theme}-400`}>SENTINEL INTERFACE</h2>
                    <h4 className={`text-${theme}-400 hidden md:block`}>Strategic Intelligence & Executive Liaison</h4>
                    {processing && <Loader2 className="animate-spin text-cyan-400" size={20} />}
                </div>
                <div className="flex gap-2 items-center">
                    {wakeWordEnabled && (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${wakeWordIndicatorClass}`}>
                            <div className={`w-2 h-2 rounded-full ${wakeWordDotClass}`} />
                            {wakeWordText}
                        </div>
                    )}
                    <button
                        onClick={toggleWakeWordMode}
                        title={wakeWordEnabled ? 'Disable always-on listening' : 'Enable always-on listening'}
                        className={`p-2 rounded-lg transition-all ${
                            wakeWordEnabled
                                ? `bg-${theme}-700 text-white`
                                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                    >
                        {wakeWordEnabled ? <Ear size={20} /> : <EarOff size={20} />}
                    </button>
                    <button
                        onClick={onTestAI}
                        disabled={processing}
                        className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-all text-sm"
                    >
                        Test AI
                    </button>
                    <button
                        onClick={toggleListening}
                        disabled={processing}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${buttonState.className}`}
                    >
                        {buttonState.icon}
                        {buttonState.text}
                    </button>
                </div>
            </div>

            {transcript && (
                <div className="bg-black/50 border border-cyan-700 rounded p-4 mb-3">
                    <div className="text-cyan-300 text-sm mb-1">VOICE INPUT:</div>
                    <div className="text-white text-lg">{transcript}</div>
                </div>
            )}

            {response && (
                <div className="bg-black/50 border border-green-700 rounded p-4">
                    <div className="text-green-300 text-sm mb-1">AI RESPONSE:</div>
                    <div className="text-white text-lg">{response}</div>
                </div>
            )}

            {!transcript && !response && (
                <div className={`text-center text-${theme}-700 text-sm`}>
                    {wakeWordEnabled ? (
                        <>Say <span className="font-bold">"Sentinel"</span> followed by your command, or click the mic button to speak directly.</>
                    ) : (
                        <>Click ACTIVATE and speak your command. I'll respond automatically after you finish speaking.</>
                    )}
                </div>
            )}
        </div>
    );
};

export default VoiceAssistant;
