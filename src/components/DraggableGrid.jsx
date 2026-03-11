import { useState, useMemo } from 'react';
import { Move, Lock, GripVertical } from 'lucide-react';

const STORAGE_KEY = 'batcomputer_widget_order';

const WIDGET_KEYS = [
    'weather', 'sports', 'calendar', 'quickcontrols',
    'spotify', 'news', 'smartthings', 'govee', 'bluetooth',
    'crealityprinter', 'phillips_hue', 'arduino'
];

const DraggableGrid = ({ children, theme = 'cyan' }) => {
    const [editMode, setEditMode] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Load saved order or use default
    const [order, setOrder] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : WIDGET_KEYS;
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
            {/* Edit Mode Toggle */}
            <div className="flex justify-end mb-3 gap-2">
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
                    {editMode ? 'Lock Layout' : 'Edit Layout'}
                </button>
            </div>

            {/* CSS Grid Layout */}
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                {orderedWidgets.map(({ key, widget }, index) => (
                    <div
                        key={key}
                        draggable={editMode}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`
                            rounded-lg
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
                        <div className={editMode ? 'h-[calc(100%-28px)]' : ''}>
                            {widget}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DraggableGrid;
