import { useState, useMemo, useRef, useEffect } from 'react';
import { Move, Lock, GripVertical } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';

const STORAGE_KEY = 'batcomputer_widget_order';
const WIDE = '(min-width: 1024px)';      // below this (phones), the old vertical stack
const MIN_ROW = 240;   // px; shorter screens scroll a little instead of squashing
const isWide = () => Boolean(window.matchMedia?.(WIDE).matches);                      // px; shorter screens scroll a little instead of squashing

// Is there something between the wheel target and the grid that scrolls vertically itself?
function innerScroller(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true;
    }
    return false;
}

const WIDGET_KEYS = [
    'weather', 'sports', 'calendar', 'quickcontrols',
    'spotify', 'news', 'smartthings', 'govee', 'bluetooth',
    'crealityprinter', 'phillips_hue',   // 'crealityprinter' slot holds the Bambu printer widget
    'scenes', 'activity', 'frametv'
];

// editMode/onEditModeChange: controlled from the Widgets menu (App). Without them the
// grid shows its own Edit Layout button (tests, standalone use).
const DraggableGrid = ({ children, theme = 'cyan', editMode: editModeProp, onEditModeChange }) => {
    const [localEdit, setLocalEdit] = useState(false);
    const controlled = typeof onEditModeChange === 'function';
    const editMode = controlled ? Boolean(editModeProp) : localEdit;
    const setEditMode = controlled ? onEditModeChange : setLocalEdit;
    const [draggedIndex, setDraggedIndex] = useState(null);
    const gridRef = useRef(null);

    // Two rows that exactly fill the screen below the top section. Sized on the DOM
    // directly (no state) so resizes and rotation just re-measure.
    useEffect(() => {
        const el = gridRef.current;
        if (!el) return undefined;
        const fit = () => {
            if (!isWide()) { el.style.height = ''; return; }
            const top = el.getBoundingClientRect().top + window.scrollY;
            const avail = window.innerHeight - top - 18;   // bottom padding + page border
            el.style.height = `${Math.max(avail, MIN_ROW * 2 + 12)}px`;
        };
        fit();
        // Start on the middle columns so there's something to swipe to on both sides.
        // Snapped to a column boundary; runs once after the first layout.
        const center = requestAnimationFrame(() => {
            if (!isWide()) return;
            const max = el.scrollWidth - el.clientWidth;
            const first = el.firstElementChild;
            if (max <= 0 || !first) return;
            const col = first.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || 0);
            el.scrollLeft = Math.min(max, Math.round(max / 2 / col) * col);
        });
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
        ro?.observe(document.body);
        window.addEventListener('resize', fit);
        return () => { cancelAnimationFrame(center); ro?.disconnect(); window.removeEventListener('resize', fit); };
    }, []);

    // Mouse wheel scrolls the grid sideways (laptop), unless a widget under the pointer scrolls itself.
    const onWheel = (e) => {
        const el = gridRef.current;
        if (!el || !isWide() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        if (innerScroller(e.target, el)) return;
        el.scrollLeft += e.deltaY;
    };

    // Load saved order or use default
    const [order, setOrder] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (!Array.isArray(saved)) return WIDGET_KEYS;
            // Keep the user's order, append widgets added since it was saved
            return [...saved.filter((k) => WIDGET_KEYS.includes(k)), ...WIDGET_KEYS.filter((k) => !saved.includes(k))];
        } catch {
            return WIDGET_KEYS;
        }
    });

    // Convert children to array and filter nulls
    const widgets = useMemo(() => {
        if (!children) return [];
        const arr = Array.isArray(children) ? children : [children];
        return arr.filter(widget => widget != null);
    }, [children]);

    // Create a map of widget key to widget component
    const widgetMap = useMemo(() => {
        const map = {};
        widgets.forEach((widget, index) => {
            const key = WIDGET_KEYS[index];
            if (key) map[key] = widget;
        });
        return map;
    }, [widgets]);

    // Get ordered widgets
    const orderedWidgets = useMemo(() => {
        return order
            .filter(key => widgetMap[key])
            .map(key => ({ key, widget: widgetMap[key] }));
    }, [order, widgetMap]);

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newOrder = [...order];
        const [removed] = newOrder.splice(draggedIndex, 1);
        newOrder.splice(index, 0, removed);
        setOrder(newOrder);
        setDraggedIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    };

    const resetLayout = () => {
        setOrder(WIDGET_KEYS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(WIDGET_KEYS));
    };

    return (
        <div className="w-full">
            {/* Edit Mode Toggle (controlled mode: only while editing, entered from the Widgets menu) */}
            {(!controlled || editMode) && <div className="flex justify-end mb-3 gap-2">
                {editMode && (
                    <button
                        onClick={resetLayout}
                        className={`px-3 py-1.5 text-xs rounded border border-${theme}-700 text-${theme}-400 hover:bg-${theme}-900/30 transition`}
                    >
                        Reset Layout
                    </button>
                )}
                <button
                    onClick={() => setEditMode(!editMode)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition ${
                        editMode
                            ? `border-yellow-600 bg-yellow-900/30 text-yellow-400`
                            : `border-${theme}-700 text-${theme}-400 hover:bg-${theme}-900/30`
                    }`}
                >
                    {editMode ? <Lock size={14} /> : <Move size={14} />}
                    {editMode ? (controlled ? 'Done' : 'Lock Layout') : 'Edit Layout'}
                </button>
            </div>}

            {/* Wide screens: two rows, new widgets add columns to the right (scroll sideways).
                Narrow screens: one column, vertical. */}
            <div
                ref={gridRef}
                onWheel={onWheel}
                data-testid="widget-grid"
                className="hud-grid grid grid-cols-1 gap-4 lg:grid-cols-none lg:grid-rows-2 lg:grid-flow-col lg:gap-3 lg:overflow-x-auto lg:overflow-y-hidden lg:snap-x lg:snap-mandatory lg:pb-2"
            >
                {orderedWidgets.map(({ key, widget }, index) => (
                    <div
                        key={key}
                        draggable={editMode}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{ '--i': index }}
                        className={`
                            hud-panel rounded-lg lg:snap-start lg:min-h-0
                            ${editMode ? 'ring-2 ring-yellow-500/50 cursor-move' : ''}
                            ${draggedIndex === index ? 'opacity-50' : ''}
                        `}
                    >
                        {editMode && (
                            <div className="bg-yellow-900/70 px-3 py-1 text-xs text-yellow-300 flex items-center gap-2 rounded-t">
                                <GripVertical size={12} />
                                <span>drag to reorder</span>
                            </div>
                        )}
                        <div className="hud-cell">
                            {/* One widget crashing must not take down the whole panel */}
                            <ErrorBoundary name={key} theme={theme}>
                                {widget}
                            </ErrorBoundary>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DraggableGrid;
