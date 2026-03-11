import React from 'react';
//import { theme } from '../theme';

// System Status Component
const SystemStatus = ({ theme, isSpotifyConnected, isNewsConnected, isGoveeConnected, isSmartThingsConnected, isHueConnected }) => (
    <div className={`col-span-12 bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 text-xs`}>
        <div className={`flex items-center justify-between text-xxs text-${theme}-700`}>
            <div className="flex gap-6">
                <div>SENTINEL: <span className="text-cyan-400">COMING SOON</span></div>
                <div>WEATHER: <span className="text-green-400">ONLINE</span></div>
                <div>SPOTIFY: <span className={isSpotifyConnected ? "text-green-400" : "text-cyan-400"}>{isSpotifyConnected ? "CONNECTED" : "PENDING AUTH"}</span></div>
                <div>SPORTS: <span className="text-green-400">ONLINE</span></div>
                <div>CALENDAR: <span className="text-cyan-400">PENDING AUTH</span></div>
                <div>NEWS: <span className={isNewsConnected ? "text-green-400" : "text-red-400"}>{isNewsConnected ? "CONNECTED" : "OFFLINE"}</span></div>
            </div>
            <div className="flex gap-6">
                <div>SMARTTHINGS: <span className={isSmartThingsConnected ? "text-green-400" : "text-red-400"}>{isSmartThingsConnected ? "CONNECTED" : "OFFLINE"}</span></div>
                <div>GOVEE: <span className={isGoveeConnected ? "text-green-400" : "text-red-400"}>{isGoveeConnected ? "CONNECTED" : "OFFLINE"}</span></div>
                <div>HUE: <span className={isHueConnected ? "text-green-400" : "text-red-400"}>{isHueConnected ? "CONNECTED" : "OFFLINE"}</span></div>
                <div>ARDUINO: <span className="text-red-400">OFFLINE</span></div>
                <div>BLUETOOTH: <span className="text-red-400">OFFLINE</span></div>
            </div>
        </div>
    </div>
);

export default SystemStatus;