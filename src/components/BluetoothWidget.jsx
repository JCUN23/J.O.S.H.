import { useState } from 'react';
import { Bluetooth, Volume2, Play, Pause, Radio, Loader2 } from 'lucide-react';

const BluetoothWidget = ({ theme }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [connectedDevice, setConnectedDevice] = useState(null);
    const [error, setError] = useState('');
    const [batteryLevel, setBatteryLevel] = useState(null);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;

    // Check if Web Bluetooth is supported
    const isBluetoothSupported = () => {
        return 'bluetooth' in navigator;
    };

    // Scan for Bluetooth devices
    const scanDevices = async () => {
        if (!isBluetoothSupported()) {
            setError('Web Bluetooth not supported in this browser. Use Chrome or Edge.');
            return;
        }

        try {
            setIsScanning(true);
            setError('');

            // Request BLE devices with common services
            const device = await navigator.bluetooth.requestDevice({
                // Accept all devices but request specific services
                acceptAllDevices: true,
                optionalServices: [
                    'battery_service',
                    'device_information',
                    'generic_access',
                    0x180F, // Battery Service
                    0x180A, // Device Information
                ]
            });

            console.log('Selected device:', device);

            // Check if device is likely an audio device
            if (device.name && (
                device.name.includes('AirPods') ||
                device.name.includes('Speaker') ||
                device.name.includes('Soundbar') ||
                device.name.includes('Headphone')
            )) {
                setError(`⚠️ ${device.name} is a Bluetooth audio device. Web Bluetooth cannot control audio devices (A2DP). Use Spotify integration for audio control instead.`);
                return;
            }

            await connectDevice(device);

        } catch (err) {
            console.error('Bluetooth error:', err);
            if (err.name === 'NotFoundError') {
                setError('No device selected');
            } else if (err.message.includes('Unsupported device')) {
                setError('This device type is not supported by Web Bluetooth. Try BLE smart lights, sensors, or Arduino devices.');
            } else {
                setError(err.message);
            }
        } finally {
            setIsScanning(false);
        }
    };

    // Connect to a specific device
    const connectDevice = async (device) => {
        try {
            console.log('Connecting to:', device.name);

            const server = await device.gatt.connect();
            console.log('Connected to GATT server');

            setConnectedDevice({
                name: device.name,
                id: device.id,
                server: server
            });

            // Try to read battery level if available
            try {
                const batteryService = await server.getPrimaryService('battery_service');
                const batteryChar = await batteryService.getCharacteristic('battery_level');
                const value = await batteryChar.readValue();
                const battery = value.getUint8(0);
                setBatteryLevel(battery);
                console.log('Battery level:', battery + '%');
            } catch (err) {
                console.log('Battery service not available:', err);
            }

            // Listen for disconnection
            device.addEventListener('gattserverdisconnected', () => {
                console.log('Device disconnected');
                setConnectedDevice(null);
                setBatteryLevel(null);
            });

        } catch (err) {
            console.error('Connection error:', err);
            setError('Failed to connect: ' + err.message);
        }
    };

    // Disconnect device
    const disconnectDevice = () => {
        if (connectedDevice?.server) {
            connectedDevice.server.disconnect();
            setConnectedDevice(null);
            setBatteryLevel(null);
        }
    };

    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 h-full flex flex-col max-h-80 overflow-hidden`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Bluetooth className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>BLUETOOTH</h3>
                </div>
                {connectedDevice && batteryLevel !== null && (
                    <div className="text-xs text-green-400 font-mono">
                        🔋 {batteryLevel}%
                    </div>
                )}
            </div>

            {!isBluetoothSupported() ? (
                <div className="text-center py-8 text-red-400 text-sm">
                    Web Bluetooth not supported. Use Chrome or Edge browser.
                </div>
            ) : connectedDevice ? (
                <div className="space-y-4">
                    <div className={`bg-black/50 border ${borderClass} rounded p-4`}>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <div className={`font-semibold text-${theme}-300`}>
                                    {connectedDevice.name || 'Unknown Device'}
                                </div>
                                <div className="text-xs text-green-400 font-mono mt-1">
                                    ✓ Connected
                                </div>
                            </div>
                            <Radio className="text-green-400 animate-pulse" size={24} />
                        </div>

                        <button
                            onClick={disconnectDevice}
                            className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-all text-sm font-mono"
                        >
                            Disconnect
                        </button>
                    </div>

                    <div className={`bg-black/50 border ${borderClass} rounded p-4`}>
                        <div className="text-sm mb-3 font-semibold">Audio Controls</div>
                        <div className="text-xs text-gray-400 mb-3">
                            Note: Most Bluetooth audio devices don't support playback control via Web Bluetooth.
                            Use your device's native controls or Spotify integration.
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                disabled
                                className="bg-gray-700 text-gray-500 px-4 py-3 rounded transition-all cursor-not-allowed"
                            >
                                <Play size={20} className="mx-auto" />
                            </button>
                            <button
                                disabled
                                className="bg-gray-700 text-gray-500 px-4 py-3 rounded transition-all cursor-not-allowed"
                            >
                                <Pause size={20} className="mx-auto" />
                            </button>
                            <button
                                disabled
                                className="bg-gray-700 text-gray-500 px-4 py-3 rounded transition-all cursor-not-allowed"
                            >
                                <Volume2 size={20} className="mx-auto" />
                            </button>
                        </div>
                    </div>

                    <div className={`text-xs ${textClass}`}>
                        💡 Tip: Use Spotify integration for full audio control
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <button
                        onClick={scanDevices}
                        disabled={isScanning}
                        className={`w-full flex items-center justify-center gap-2 ${isScanning
                            ? 'bg-gray-700 cursor-wait'
                            : `bg-${theme}-700 hover:bg-${theme}-600'}`
                            } text-white px-6 py-4 rounded-lg transition-all font-mono font-semibold`}
                    >
                        {isScanning ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Scanning...
                            </>
                        ) : (
                            <>
                                <Bluetooth size={20} />
                                Scan for Devices
                            </>
                        )}
                    </button>

                    {error && (
                        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className={`bg-black/50 border ${borderClass} rounded p-4`}>
                        <div className={`ext-sm mb-2 font-semibold text-${theme}-400`}>Compatible Devices:</div>
                        <ul className={`text-xs text-${theme}-600 space-y-1`}>
                            <li>• Bluetooth speakers & soundbars</li>
                            <li>• Wireless headphones</li>
                            <li>• BLE-enabled smart devices</li>
                            <li>• Some smart lights (BLE)</li>
                        </ul>
                    </div>

                    <div className={`text-xs text-${theme}-700 text-center`}>
                        Click scan to pair with nearby devices
                    </div>
                </div>
            )}
        </div>
    );
};

export default BluetoothWidget;