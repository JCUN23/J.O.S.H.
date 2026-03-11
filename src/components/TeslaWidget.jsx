import React, { useState, useEffect } from 'react';
import { Car, Battery, Zap, Lock, Unlock, Wind, MapPin, RefreshCw } from 'lucide-react';

const BACKEND_URL = 'http://127.0.0.1:3001';

const TeslaWidget = ({ theme }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [vehicleData, setVehicleData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkConnection();
        // Auto-refresh every 60 seconds
        const interval = setInterval(fetchVehicleData, 60000);
        return () => clearInterval(interval);
    }, []);

    const checkConnection = async () => {
        const token = localStorage.getItem('tesla_access_token');
        if (token) {
            setIsConnected(true);
            fetchVehicleData();
        }
    };

    const handleConnect = () => {
        window.location.href = `${BACKEND_URL}/auth/tesla`;
    };

    const fetchVehicleData = async () => {
        const token = localStorage.getItem('tesla_access_token');
        if (!token) return;

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${BACKEND_URL}/api/tesla/vehicle`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired
                    localStorage.removeItem('tesla_access_token');
                    setIsConnected(false);
                    return;
                }
                throw new Error('Failed to fetch vehicle data');
            }

            const data = await response.json();
            setVehicleData(data);
        } catch (err) {
            console.error('Tesla API error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCommand = async (command, value = null) => {
        const token = localStorage.getItem('tesla_access_token');
        if (!token) return;

        setLoading(true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/tesla/command`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command, value })
            });

            if (!response.ok) throw new Error('Command failed');

            // Refresh data after command
            setTimeout(fetchVehicleData, 2000);
        } catch (err) {
            console.error('Tesla command error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isConnected) {
        return (
            <div className={`bg-gradient-to-r from-${theme}-100 to-${theme}-200 border border-${theme}-800 rounded-lg p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Car className={`text-${theme}-400`} size={24} />
                        <h2 className={`text-xl font-semibold text-${theme}-400`}>TESLA</h2>
                    </div>
                </div>
                <button
                    onClick={handleConnect}
                    className={`w-full bg-${theme}-700 hover:bg-${theme}-600 text-white py-3 px-4 rounded-lg transition-all`}
                >
                    Connect Tesla Account
                </button>
            </div>
        );
    }

    return (
        <div className={`bg-gradient-to-r from-${theme}-100 to-${theme}-200 border border-${theme}-800 rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Car className={`text-${theme}-400`} size={24} />
                    <h2 className={`text-xl font-semibold text-${theme}-400`}>
                        {vehicleData?.display_name || 'TESLA'}
                    </h2>
                </div>
                <button
                    onClick={fetchVehicleData}
                    disabled={loading}
                    className={`p-2 rounded-lg bg-${theme}-700 hover:bg-${theme}-600 text-white transition-all ${loading ? 'animate-spin' : ''}`}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-700 rounded p-2 mb-4 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {vehicleData && (
                <>
                    {/* Battery & Charging Status */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-black/30 rounded p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Battery className={`text-${theme}-400`} size={18} />
                                <span className={`text-${theme}-400 text-sm`}>Battery</span>
                            </div>
                            <div className={`text-2xl font-bold text-${theme}-300`}>
                                {vehicleData.charge_state?.battery_level || 0}%
                            </div>
                            <div className={`text-xs text-${theme}-600`}>
                                {vehicleData.charge_state?.battery_range || 0} mi range
                            </div>
                        </div>

                        <div className="bg-black/30 rounded p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Zap className={`text-${theme}-400`} size={18} />
                                <span className={`text-${theme}-400 text-sm`}>Charging</span>
                            </div>
                            <div className={`text-lg font-bold text-${theme}-300`}>
                                {vehicleData.charge_state?.charging_state || 'Disconnected'}
                            </div>
                            {vehicleData.charge_state?.charging_state === 'Charging' && (
                                <div className={`text-xs text-${theme}-600`}>
                                    {vehicleData.charge_state?.charge_rate || 0} mi/hr
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Vehicle Status */}
                    <div className="bg-black/30 rounded p-3 mb-4">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                                <Lock className={`text-${theme}-400`} size={16} />
                                <span className={`text-${theme}-300`}>
                                    {vehicleData.vehicle_state?.locked ? 'Locked' : 'Unlocked'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Wind className={`text-${theme}-400`} size={16} />
                                <span className={`text-${theme}-300`}>
                                    {vehicleData.climate_state?.is_climate_on ? 'Climate On' : 'Climate Off'}
                                </span>
                            </div>
                            {vehicleData.climate_state?.inside_temp && (
                                <div className="flex items-center gap-2">
                                    <span className={`text-${theme}-400`}>🌡️</span>
                                    <span className={`text-${theme}-300`}>
                                        {Math.round(vehicleData.climate_state.inside_temp * 9/5 + 32)}°F inside
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <MapPin className={`text-${theme}-400`} size={16} />
                                <span className={`text-${theme}-300`}>
                                    {vehicleData.vehicle_state?.odometer ?
                                        `${Math.round(vehicleData.vehicle_state.odometer)} mi` :
                                        'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => handleCommand(vehicleData.vehicle_state?.locked ? 'unlock' : 'lock')}
                            disabled={loading}
                            className={`bg-${theme}-700 hover:bg-${theme}-600 text-white py-2 px-3 rounded transition-all text-sm flex items-center justify-center gap-2`}
                        >
                            {vehicleData.vehicle_state?.locked ? <Unlock size={16} /> : <Lock size={16} />}
                            {vehicleData.vehicle_state?.locked ? 'Unlock' : 'Lock'}
                        </button>

                        <button
                            onClick={() => handleCommand('climate', !vehicleData.climate_state?.is_climate_on)}
                            disabled={loading}
                            className={`bg-${theme}-700 hover:bg-${theme}-600 text-white py-2 px-3 rounded transition-all text-sm flex items-center justify-center gap-2`}
                        >
                            <Wind size={16} />
                            {vehicleData.climate_state?.is_climate_on ? 'Climate Off' : 'Climate On'}
                        </button>

                        {vehicleData.charge_state?.charging_state === 'Charging' ? (
                            <button
                                onClick={() => handleCommand('stop_charge')}
                                disabled={loading}
                                className={`bg-red-700 hover:bg-red-600 text-white py-2 px-3 rounded transition-all text-sm flex items-center justify-center gap-2`}
                            >
                                <Zap size={16} />
                                Stop Charge
                            </button>
                        ) : vehicleData.charge_state?.charging_state === 'Stopped' ? (
                            <button
                                onClick={() => handleCommand('start_charge')}
                                disabled={loading}
                                className={`bg-green-700 hover:bg-green-600 text-white py-2 px-3 rounded transition-all text-sm flex items-center justify-center gap-2`}
                            >
                                <Zap size={16} />
                                Start Charge
                            </button>
                        ) : null}

                        <button
                            onClick={() => handleCommand('honk')}
                            disabled={loading}
                            className={`bg-${theme}-700 hover:bg-${theme}-600 text-white py-2 px-3 rounded transition-all text-sm`}
                        >
                            🔊 Honk
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default TeslaWidget;
