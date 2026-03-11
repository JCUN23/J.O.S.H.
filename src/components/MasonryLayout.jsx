import { useEffect, useState, useRef, useMemo } from 'react';

const MasonryLayout = ({ children, gap = 16, minColumnWidth = 450 }) => {
    // Store column layout as indices only, not widget references
    const [columnLayout, setColumnLayout] = useState([]);
    const widgetRefs = useRef([]);
    const hasOrganizedRef = useRef(false);
    const containerRef = useRef(null);

    // Memoize widgets array
    const widgets = useMemo(() => {
        if (!children) return [];
        const arr = Array.isArray(children) ? children : [children];
        return arr.filter(widget => widget != null);
    }, [children]);

    const widgetCount = widgets.length;

    useEffect(() => {
        if (widgetCount === 0) return;

        // Only organize once on mount
        if (hasOrganizedRef.current) return;
        hasOrganizedRef.current = true;

        // Use a short timeout to let widgets render first
        setTimeout(() => {
            organizeIntoColumns();
        }, 100);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [widgetCount]);

    const organizeIntoColumns = () => {
        // Calculate available height: viewport height minus offset for header/fixed content
        const headerOffset = containerRef.current?.getBoundingClientRect().top || 250;
        const maxColumnHeight = window.innerHeight - headerOffset - 32; // 32px padding

        const organizedColumns = [];
        let currentColumn = [];
        let currentColumnHeight = 0;

        widgets.forEach((widget, index) => {
            // Try to get actual height, fallback to estimate
            const actualHeight = widgetRefs.current[index]?.offsetHeight || estimateWidgetHeight(widget);

            if (currentColumnHeight + actualHeight > maxColumnHeight && currentColumn.length > 0) {
                organizedColumns.push(currentColumn);
                currentColumn = [index];
                currentColumnHeight = actualHeight;
            } else {
                currentColumn.push(index);
                currentColumnHeight += actualHeight + gap;
            }
        });

        if (currentColumn.length > 0) {
            organizedColumns.push(currentColumn);
        }

        setColumnLayout(organizedColumns);
    };

    const estimateWidgetHeight = (widget) => {
        if (!widget || !widget.type) return 300;

        const widgetName = widget.type.name || widget.type.displayName;

        const heightMap = {
            'WeatherWidget': 250,
            'SportsWidget': 380,
            'NewsWidget': 450,
            'CalendarWidget': 320,
            'QuickControls': 400,
            'GoveeWidget': 500,
            'BluetoothWidget': 400,
            'default': 350
        };

        return heightMap[widgetName] || heightMap.default;
    };

    // If layout not yet computed, render widgets in a single column temporarily
    if (columnLayout.length === 0 && widgets.length > 0) {
        return (
            <div ref={containerRef} className="w-full overflow-x-auto overflow-y-hidden pb-4" style={{ scrollbarWidth: 'thin' }}>
                <div className="flex gap-4 items-start">
                    <div
                        className="flex flex-col gap-4"
                        style={{
                            minWidth: `${minColumnWidth}px`,
                            maxWidth: `${minColumnWidth + 150}px`,
                            flexShrink: 0
                        }}
                    >
                        {widgets.map((widget, index) => (
                            <div
                                key={`widget-${index}`}
                                ref={el => widgetRefs.current[index] = el}
                            >
                                {widget}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full overflow-x-auto overflow-y-hidden pb-4" style={{ scrollbarWidth: 'thin' }}>
            <div className="flex gap-4 items-start">
                {columnLayout.map((columnIndices, columnIndex) => (
                    <div
                        key={columnIndex}
                        className="flex flex-col gap-4"
                        style={{
                            minWidth: `${minColumnWidth}px`,
                            maxWidth: `${minColumnWidth + 150}px`,
                            flexShrink: 0
                        }}
                    >
                        {columnIndices.map((widgetIndex) => (
                            <div
                                key={`widget-${widgetIndex}`}
                                ref={el => widgetRefs.current[widgetIndex] = el}
                            >
                                {widgets[widgetIndex]}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MasonryLayout;