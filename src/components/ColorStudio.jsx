import { useEffect, useRef, useState } from 'react';
import { rgbToHex, hexToRgb, hsvToRgb, rgbToHsv, getRecentColors, addRecentColor, PRESETS, TEAM_COLORS } from '../utils/color';

// Full-RGB color picker for the light widgets: drag on the wheel (angle = hue,
// distance from center = saturation), or type an exact hex / R G B.
//   onPreview(rgb)  while dragging (Hue: live; omit it for Govee's rate-limited cloud)
//   onCommit(rgb)   on release, a swatch tap, or a typed value
const SIZE = 200;

function drawWheel(canvas) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;                              // no canvas (tests)
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(SIZE * dpr);
    canvas.width = px;
    canvas.height = px;
    const img = ctx.createImageData(px, px);
    const R = px / 2;
    for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
            const dx = x - R + 0.5, dy = y - R + 0.5;
            const d = Math.hypot(dx, dy);
            if (d > R) continue;
            const { r, g, b } = hsvToRgb({ h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, s: d / R, v: 1 });
            const i = (y * px + x) * 4;
            img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
            img.data[i + 3] = d > R - 1 ? Math.round((R - d) * 255) : 255;      // soft edge
        }
    }
    ctx.putImageData(img, 0, 0);
}

const Swatches = ({ label, colors, onPick, disabled, theme }) => (
    <div>
        <div className={`text-[10px] uppercase tracking-wider text-${theme}-700 mb-1`}>{label}</div>
        <div className="flex flex-wrap gap-1.5">
            {colors.map(({ name, hex }) => (
                <button key={`${label}-${hex}`} type="button" title={name || hex} aria-label={name || hex}
                    disabled={disabled} onClick={() => onPick(hexToRgb(hex))}
                    className="w-7 h-7 rounded-full border border-white/20 hover:border-white/70 hover:scale-110 transition-transform disabled:opacity-40"
                    style={{ backgroundColor: hex }} />
            ))}
        </div>
    </div>
);

const ColorStudio = ({ theme, value, onPreview, onCommit, disabled, note }) => {
    const [rgb, setRgb] = useState(value || { r: 255, g: 255, b: 255 });
    const [hexText, setHexText] = useState(() => rgbToHex(value || { r: 255, g: 255, b: 255 }));
    const [recent, setRecent] = useState(getRecentColors);
    const canvasRef = useRef(null);
    const dragging = useRef(false);

    useEffect(() => { if (canvasRef.current) drawWheel(canvasRef.current); }, []);

    const show = (c) => { setRgb(c); setHexText(rgbToHex(c)); };
    const commit = (c) => {
        if (!c || disabled) return;
        show(c);
        setRecent(addRecentColor(c));
        onCommit?.(c);
    };
    const fromPointer = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const R = rect.width / 2;
        const dx = e.clientX - rect.left - R, dy = e.clientY - rect.top - R;
        return hsvToRgb({ h: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / R), v: 1 });
    };
    const down = (e) => {
        if (disabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const c = fromPointer(e); show(c); onPreview?.(c);
    };
    const move = (e) => { if (!dragging.current) return; const c = fromPointer(e); show(c); onPreview?.(c); };
    const up = (e) => { if (!dragging.current) return; dragging.current = false; commit(fromPointer(e)); };

    const { h, s } = rgbToHsv(rgb);
    const markerX = 50 + 50 * s * Math.sin((h * Math.PI) / 180);
    const markerY = 50 - 50 * s * Math.cos((h * Math.PI) / 180);
    const hex = rgbToHex(rgb);
    const setChannel = (k, v) => show({ ...rgb, [k]: Math.max(0, Math.min(255, parseInt(v, 10) || 0)) });
    const onKey = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };

    return (
        <div className={`space-y-3 ${disabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-4 flex-wrap">
                <div className="relative shrink-0 select-none" style={{ width: SIZE, height: SIZE, maxWidth: '100%', touchAction: 'none' }}>
                    <canvas ref={canvasRef} data-testid="color-wheel"
                        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                        className="w-full h-full rounded-full cursor-crosshair" style={{ width: SIZE, height: SIZE }} />
                    <div className="absolute w-5 h-5 rounded-full border-2 border-white pointer-events-none"
                        style={{ left: `${markerX}%`, top: `${markerY}%`, transform: 'translate(-50%, -50%)', backgroundColor: hex, boxShadow: '0 0 0 1px rgba(0,0,0,.6)' }} />
                </div>

                <div className="flex-1 min-w-[140px] space-y-2">
                    <div className="h-12 rounded border border-white/20" style={{ backgroundColor: hex }} data-testid="color-preview" />
                    <label className={`block text-[10px] uppercase tracking-wider text-${theme}-700`}>
                        Hex
                        <input value={hexText} disabled={disabled} aria-label="Hex color"
                            onChange={(e) => setHexText(e.target.value)} onKeyDown={onKey}
                            onBlur={() => { const c = hexToRgb(hexText); if (c) commit(c); else setHexText(hex); }}
                            className={`mt-1 w-full bg-black/60 border border-${theme}-800 rounded px-2 py-1 font-mono text-sm text-${theme}-300`} />
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                        {['r', 'g', 'b'].map((k) => (
                            <label key={k} className={`text-[10px] uppercase text-${theme}-700`}>
                                {k}
                                <input type="number" min="0" max="255" inputMode="numeric" value={rgb[k]} disabled={disabled}
                                    aria-label={`${k.toUpperCase()} value`}
                                    onChange={(e) => setChannel(k, e.target.value)} onKeyDown={onKey} onBlur={() => commit(rgb)}
                                    className={`mt-1 w-full bg-black/60 border border-${theme}-800 rounded px-1 py-1 font-mono text-sm text-${theme}-300`} />
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            {note && <div className={`text-[10px] text-${theme}-700`}>{note}</div>}
            {recent.length > 0 && <Swatches label="Recent" colors={recent.map((hx) => ({ hex: hx }))} onPick={commit} disabled={disabled} theme={theme} />}
            <Swatches label="Presets" colors={PRESETS} onPick={commit} disabled={disabled} theme={theme} />
            <Swatches label="Team colors" colors={TEAM_COLORS} onPick={commit} disabled={disabled} theme={theme} />
        </div>
    );
};

export default ColorStudio;
