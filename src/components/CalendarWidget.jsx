import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw, Loader2 } from 'lucide-react';
import { startGoogleAuth, getGoogleCalendarEvents } from '../utils/calendarApi';

const CalendarWidget = ({ theme }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;

    const checkConnection = useCallback(() => {
        const token = localStorage.getItem('google_access_token');
        const expiresAt = localStorage.getItem('google_expires_at');
        // Consider connected if we have a token (even if expired, we can refresh)
        setIsConnected(!!token && !!expiresAt);
        return !!token && !!expiresAt;
    }, []);

    const fetchEvents = useCallback(async () => {
        if (!checkConnection()) return;

        try {
            setLoading(true);
            setError('');
            const googleEvents = await getGoogleCalendarEvents();
            setEvents(googleEvents);
        } catch (err) {
            console.error('Failed to fetch calendar events:', err);
            if (err.message?.includes('401') || err.message?.includes('invalid_grant')) {
                // Token expired or invalid, clear and show connect button
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_refresh_token');
                localStorage.removeItem('google_expires_at');
                setIsConnected(false);
                setError('Session expired. Please reconnect.');
            } else {
                setError('Failed to load events');
            }
        } finally {
            setLoading(false);
        }
    }, [checkConnection]);

    // Handle OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        // Check if this is a Google OAuth callback
        if (code && state === 'google_calendar') {
            // Exchange code for token
            const exchangeToken = async () => {
                try {
                    const response = await fetch('http://127.0.0.1:3001/auth/google/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code })
                    });

                    const data = await response.json();

                    if (data.access_token) {
                        localStorage.setItem('google_access_token', data.access_token);
                        localStorage.setItem('google_refresh_token', data.refresh_token);
                        localStorage.setItem('google_expires_at', Date.now() + data.expires_in * 1000);
                        setIsConnected(true);
                        // Clear URL params
                        window.history.replaceState({}, '', '/');
                        // Fetch events
                        fetchEvents();
                    }
                } catch (err) {
                    console.error('Token exchange failed:', err);
                    setError('Failed to connect');
                }
            };

            exchangeToken();
        }
    }, [fetchEvents]);

    // Initial load
    useEffect(() => {
        if (checkConnection()) {
            fetchEvents();
        }
    }, [checkConnection, fetchEvents]);

    const handleConnect = () => {
        startGoogleAuth();
    };

    const handleDisconnect = () => {
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_refresh_token');
        localStorage.removeItem('google_expires_at');
        setIsConnected(false);
        setEvents([]);
    };

    if (loading && events.length === 0) {
        return (
            <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col items-center justify-center overflow-hidden`}>
                <Loader2 className={`animate-spin ${textClass} mb-4`} size={32} />
                <div className={`text-sm text-${theme}-600`}>Loading calendar...</div>
            </div>
        );
    }

    return (
        <div className={`${bgClass} border ${borderClass} rounded-lg p-6 flex flex-col max-h-80 overflow-hidden`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Calendar className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>CALENDAR</h3>
                </div>
                {isConnected && (
                    <button
                        onClick={fetchEvents}
                        disabled={loading}
                        className={`text-${theme}-500 hover:text-${theme}-400 transition-colors`}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-400 text-sm mb-4">
                    {error}
                </div>
            )}

            {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-6">
                    <div className={`text-sm text-${theme}-600 mb-4 text-center`}>
                        Connect your Google Calendar to see upcoming events
                    </div>
                    <button
                        onClick={handleConnect}
                        className={`flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-all text-sm`}
                    >
                        <Calendar size={16} />
                        Connect Google Calendar
                    </button>
                </div>
            ) : (
                <>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {events.length === 0 ? (
                            <div className={`text-sm text-${theme}-600 text-center py-4`}>
                                No events for today or tomorrow
                            </div>
                        ) : (
                            events.map((event, idx) => (
                                <div
                                    key={idx}
                                    className={`bg-black/50 border ${borderClass} rounded p-3 hover:border-${theme}-600 transition-colors`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-semibold text-${theme}-300 truncate`}>
                                                {event.title}
                                            </div>
                                            <div className={`text-xs text-${theme}-700`}>
                                                {event.day} · {event.calendar}
                                            </div>
                                        </div>
                                        <div className={`text-${theme}-400 text-sm whitespace-nowrap`}>
                                            {event.time}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <button
                        onClick={handleDisconnect}
                        className={`mt-4 text-xs text-${theme}-700 hover:text-${theme}-500 transition-colors`}
                    >
                        Disconnect
                    </button>
                </>
            )}
        </div>
    );
};

export default CalendarWidget;
