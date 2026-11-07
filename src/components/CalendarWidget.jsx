import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, RefreshCw, Loader2, Unlink } from 'lucide-react';
import { startGoogleAuth, getGoogleCalendarEvents, exchangeGoogleToken } from '../utils/calendarApi';
import { getAuthStatus, disconnectProvider } from '../utils/authApi';

const CalendarWidget = ({ theme }) => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isConnected, setIsConnected] = useState(false);

    const borderClass = `border-${theme}-800`;
    const bgClass = `bg-${theme}-950/30`;
    const textClass = `text-${theme}-400`;

    // Connection lives on the server, shared by every device.
    const checkConnection = useCallback(async () => {
        try {
            const status = await getAuthStatus();
            setIsConnected(Boolean(status.google));
            return Boolean(status.google);
        } catch {
            return false;
        }
    }, []);

    const fetchEvents = useCallback(async () => {
        if (!(await checkConnection())) return;

        try {
            setLoading(true);
            setError('');
            const googleEvents = await getGoogleCalendarEvents();
            setEvents(googleEvents);
        } catch (err) {
            console.error('Failed to fetch calendar events:', err);
            if (err.code === 'calendar_scope_missing') {
                // Drop the email-only login so the Connect button comes back
                await disconnectProvider('google').catch(() => {});
                setIsConnected(false);
                setError(err.message);
            } else if (err.message?.includes('not connected')) {
                // Server cleared a revoked login: show the connect button
                setIsConnected(false);
                setError('Google sign-in expired. Connect again to see events.');
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
            // OAuth codes are single-use; StrictMode runs effects twice in dev.
            if (sessionStorage.getItem('google_code_exchanged') === code) return;
            sessionStorage.setItem('google_code_exchanged', code);

            const exchangeToken = async () => {
                try {
                    await exchangeGoogleToken(code); // server stores the login
                    setIsConnected(true);
                    window.history.replaceState({}, '', '/');
                    fetchEvents();
                } catch (err) {
                    console.error('Token exchange failed:', err);
                    window.history.replaceState({}, '', '/');
                    setError(err.message || 'Failed to connect');
                }
            };

            exchangeToken();
        }
    }, [fetchEvents]);

    // Initial load (fetchEvents checks the connection itself)
    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleConnect = () => {
        startGoogleAuth();
    };

    const handleDisconnect = async () => {
        await disconnectProvider('google');
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
        <div className={`${bgClass} border ${borderClass} rounded-lg p-3 flex flex-col max-h-96 overflow-hidden`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Calendar className={textClass} size={20} />
                    <h3 className={`text-lg font-semibold text-${theme}-400`}>CALENDAR</h3>
                </div>
                {isConnected && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDisconnect}
                            aria-label="Disconnect Google Calendar"
                            title="Disconnect Google Calendar"
                            className={`text-${theme}-700 hover:text-${theme}-500 transition-colors`}
                        >
                            <Unlink size={14} />
                        </button>
                        <button
                            onClick={fetchEvents}
                            disabled={loading}
                            aria-label="Refresh calendar"
                            className={`text-${theme}-500 hover:text-${theme}-400 transition-colors`}
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
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
                    <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0 pr-1">
                        {events.length === 0 ? (
                            <div className={`text-sm text-${theme}-600 text-center py-4`}>
                                Nothing on the calendar this week
                            </div>
                        ) : (
                            events.map((event, idx) => (
                                <div key={idx}>
                                {(idx === 0 || events[idx - 1].dayKey !== event.dayKey) && (
                                    <div className={`text-[10px] uppercase tracking-widest text-${theme}-600 ${idx ? 'pt-2' : ''} pb-1`}>
                                        {event.day}
                                    </div>
                                )}
                                <div
                                    className={`bg-black/50 border ${borderClass} rounded px-3 py-2 hover:border-${theme}-600 transition-colors`}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className={`font-semibold text-${theme}-300 truncate`}>
                                                {event.title}
                                            </div>
                                            <div className={`text-xs text-${theme}-700 truncate`}>
                                                {event.ongoing ? 'Ongoing · ' : ''}{event.calendar}
                                            </div>
                                        </div>
                                        <div className={`${event.allDay ? `text-${theme}-600 text-xs` : `text-${theme}-400 text-sm`} whitespace-nowrap`}>
                                            {event.time}
                                        </div>
                                    </div>
                                </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default CalendarWidget;
