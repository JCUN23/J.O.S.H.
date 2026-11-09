import { useEffect, useState } from 'react';
import { Timer, Bell, X } from 'lucide-react';
import { BACKEND_URL } from '../config';

// Running timers/reminders as small chips on the Sentinel bar, with a live countdown and
// a tap-to-cancel. Alfred sets them by voice (backend lib/timers.js).
const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
const clock = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const TimerChips = ({ theme }) => {
    const [items, setItems] = useState([]);
    const [skew, setSkew] = useState(0);            // server clock - this device's clock
    const [clockNow, setClockNow] = useState(() => Date.now());   // ticks every second

    useEffect(() => {
        let alive = true;
        const load = () => fetch(`${BACKEND_URL}/api/timers`).then((r) => (r.ok ? r.json() : null)).then((d) => {
            if (alive && d) { setItems(d.items || []); setSkew((d.now || Date.now()) - Date.now()); }
        }).catch(() => {});
        load();
        const poll = setInterval(load, 5000);
        const tick = setInterval(() => setClockNow(Date.now()), 1000);
        return () => { alive = false; clearInterval(poll); clearInterval(tick); };
    }, []);

    const cancel = (id) => {
        setItems((list) => list.filter((t) => t.id !== id));
        fetch(`${BACKEND_URL}/api/timers/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: id }) }).catch(() => {});
    };

    const now = clockNow + skew;
    const live = items.filter((t) => t.dueAt > now - 1000);
    if (!live.length) return null;
    return (
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden" data-testid="timer-chips">
            {live.slice(0, 3).map((t) => (
                <span key={t.id} className={`flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-xs border border-${theme}-700 bg-black/40 text-${theme}-300`}
                    title={t.kind === 'timer' ? `${t.label || 'Timer'}` : `Reminder: ${t.label}`}>
                    {t.kind === 'timer' ? <Timer size={12} /> : <Bell size={12} />}
                    {t.kind === 'timer' ? `${t.label ? `${t.label} ` : ''}${fmt(t.dueAt - now)}` : `${clock(t.dueAt)} ${t.label}`.slice(0, 28)}
                    <button type="button" onClick={() => cancel(t.id)} aria-label={`Cancel ${t.label || t.kind}`} className="ml-0.5 opacity-60 hover:opacity-100"><X size={11} /></button>
                </span>
            ))}
            {live.length > 3 && <span className={`text-xs text-${theme}-600`}>+{live.length - 3}</span>}
        </div>
    );
};

export default TimerChips;
