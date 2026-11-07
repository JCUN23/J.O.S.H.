import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DraggableGrid from './DraggableGrid';

// Must mirror WIDGET_KEYS: children map to keys by position
const KEYS = ['weather', 'sports', 'calendar', 'quickcontrols', 'spotify', 'news', 'smartthings', 'govee', 'bluetooth', 'crealityprinter', 'phillips_hue', 'scenes', 'activity', 'frametv'];
const renderAll = () => render(<DraggableGrid>{KEYS.map((k) => <div key={k}>{k}-widget</div>)}</DraggableGrid>);
const order = () => screen.getAllByText(/-widget$/).map((n) => n.textContent.replace('-widget', ''));

describe('DraggableGrid', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows widgets added after a layout was saved (regression: new widgets never appeared)', () => {
    localStorage.setItem('batcomputer_widget_order', JSON.stringify(KEYS.slice(0, 11).reverse()));
    renderAll();
    expect(screen.getByText('scenes-widget')).toBeTruthy();
    expect(screen.getByText('frametv-widget')).toBeTruthy();
    expect(order()[0]).toBe('phillips_hue');            // saved order kept for existing widgets
  });

  it('a layout saved with a removed widget (Tesla\'s old "arduino" slot) keeps everything in place', () => {
    localStorage.setItem('batcomputer_widget_order', JSON.stringify(['arduino', 'scenes', 'weather', ...KEYS.filter((k) => !['scenes', 'weather'].includes(k))]));
    renderAll();
    const o = order();
    expect(o.slice(0, 2)).toEqual(['scenes', 'weather']);
    expect(o).toHaveLength(KEYS.length);
    expect(new Set(o)).toEqual(new Set(KEYS));          // each widget under its own key, none shifted
  });
});
