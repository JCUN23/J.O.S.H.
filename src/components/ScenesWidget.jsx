import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Film, Sofa, Target, Sun, Moon, Power, Play, Loader2 } from 'lucide-react';
import { getScenes, activateScene, getRules, setRuleEnabled, runRule } from '../utils/automationApi';
import { getPresence } from '../utils/homeApi';

const ICONS = { film: Film, sofa: Sofa, target: Target, sun: Sun, moon: Moon, power: Power };

// Scenes (one tap, many devices) + rules (automatic triggers) in one card.
const ScenesWidget = ({ theme }) => {
    const [scenes, setScenes] = useState([]);
    const [rules, setRules] = useState([]);
    const [busy, setBusy] = useState(null);           // scene/rule id in flight
    const [flash, setFlash] = useState(null);         // { id, ok, text }
    const [error, setError] = useState('');
    const [people, setPeople] = useState([]);         // presence (Tailscale)

    useEffect(() => {
        let alive = true;
        const poll = () => getPresence().then((d) => { if (alive) setPeople(d.people || []); }).catch(() => {});
        poll();
        const t = setInterval(poll, 60000);
        return () => { alive = false; clearInterval(t); };
    }, []);

    const load = useCallback(async () => {
        try {
            const [s, r] = await Promise.all([getScenes(), getRules()]);
            setScenes(s); setRules(r); setError('');
        } catch {
            setError("Couldn't load scenes. Check that the backend is running.");
        }
    }, []);

    useEffect(() => {
        let alive = true;
        Promise.all([getScenes(), getRules()])
            .then(([sc, r]) => { if (alive) { setScenes(sc); setRules(r); setError(''); } })
            .catch(() => { if (alive) setError("Couldn't load scenes. Check that the backend is running."); });
        return () => { alive = false; };
    }, []);

    const showResult = (id, ok, text) => {
        setFlash({ id, ok, text });
        setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 4000);
    };

    const onScene = async (scene) => {
        setBusy(scene.id);
        try {
            const r = await activateScene(scene.id);
            showResult(scene.id, r.ok, r.ok ? `${scene.name} on` : r.results.find((x) => /error|not/i.test(x)) || 'Partly applied');
        } catch (e) {
            showResult(scene.id, false, e.message);
        } finally { setBusy(null); }
    };

    const onToggle = async (rule) => {
        setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));   // optimistic
        try { await setRuleEnabled(rule.id, !rule.enabled); }
        catch { load(); }
    };

    const onRun = async (rule) => {
        setBusy(rule.id);
        try {
            const r = await runRule(rule.id);
            showResult(rule.id, r.ok !== false, r.ok !== false ? 'Ran' : 'Partly applied');
        } catch (e) { showResult(rule.id, false, e.message); }
        finally { setBusy(null); }
    };

    return (
        <div className={`bg-${theme}-950/30 border border-${theme}-800 rounded-lg p-3 min-h-[300px] max-h-96 overflow-y-auto`}>
            <div className="flex items-center gap-2 mb-3">
                <Sparkles className={`text-${theme}-400`} size={20} />
                <h3 className={`text-lg font-semibold text-${theme}-400`}>SCENES</h3>
            </div>
            {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

            <div className="grid grid-cols-3 gap-2 mb-4">
                {scenes.map((s) => {
                    const Icon = ICONS[s.icon] || Sparkles;
                    const f = flash?.id === s.id ? flash : null;
                    return (
                        <button
                            key={s.id}
                            onClick={() => onScene(s)}
                            disabled={busy !== null}
                            title={s.description}
                            className={`bg-black/50 border rounded p-2 transition-all text-center
                                ${f ? (f.ok ? 'border-green-600' : 'border-red-600') : `border-${theme}-800 hover:border-${theme}-600 hover:bg-${theme}-900/20`}
                                ${busy !== null && busy !== s.id ? 'opacity-50' : ''}`}
                        >
                            {busy === s.id
                                ? <Loader2 size={20} className={`mx-auto mb-1 animate-spin text-${theme}-400`} />
                                : <Icon size={20} className={`mx-auto mb-1 text-${theme}-400`} />}
                            <div className={`text-xs text-${theme}-300 truncate`}>{s.name}</div>
                            {f && <div className={`text-[10px] truncate ${f.ok ? 'text-green-400' : 'text-red-400'}`}>{f.text}</div>}
                        </button>
                    );
                })}
            </div>

            {people.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className={`text-xs text-${theme}-600 mr-1`}>Home</span>
                    {people.map((p) => (
                        <span key={p.id} title={p.since ? `since ${new Date(p.since).toLocaleTimeString()}` : 'checking…'}
                            className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${p.status === 'home' ? 'bg-green-600/25 text-green-400' : 'bg-gray-700/40 text-gray-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'home' ? 'bg-green-400' : p.status === 'away' ? 'bg-gray-500' : 'bg-yellow-400'}`} />
                            {p.name}{p.status === 'unknown' ? ' ?' : p.status === 'away' ? ' (away)' : ''}
                        </span>
                    ))}
                </div>
            )}
            <div className={`text-xs text-${theme}-600 mb-1`}>Rules</div>
            <div className="space-y-1">
                {rules.map((r) => (
                    <div key={r.id} className={`flex items-center gap-2 bg-black/40 border border-${theme}-900 rounded px-2 py-1.5`}>
                        <button
                            role="switch"
                            aria-checked={r.enabled}
                            aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                            onClick={() => onToggle(r)}
                            className={`w-8 h-4 rounded-full relative shrink-0 transition-colors ${r.enabled ? `bg-${theme}-500` : 'bg-gray-700'}`}
                        >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${r.enabled ? 'left-4' : 'left-0.5'}`} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className={`text-xs truncate ${r.enabled ? `text-${theme}-300` : `text-${theme}-700`}`}>{r.name}</div>
                            <div className={`text-[10px] text-${theme}-700 truncate`}>{r.when}</div>
                        </div>
                        <button
                            onClick={() => onRun(r)}
                            disabled={busy !== null}
                            aria-label={`Run ${r.name} now`}
                            title="Run now"
                            className={`p-1 rounded border border-${theme}-800 text-${theme}-500 hover:text-${theme}-300 shrink-0`}
                        >
                            {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ScenesWidget;
