import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DraggableGrid from './DraggableGrid';

const KEYS = ['weather', 'sports', 'calendar', 'quickcontrols', 'spotify', 'news', 'smartthings', 'govee', 'bluetooth', 'crealityprinter', 'phillips_hue', 'arduino', 'scenes', 'activity'];

describe('DraggableGrid', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows widgets added after a layout was saved (regression: new widgets never appeared)', () => {
    localStorage.setItem('batcomputer_widget_order', JSON.stringify(KEYS.slice(0, 12).reverse()));
    render(<DraggableGrid>{KEYS.map((k) => <div key={k}>{k}-widget</div>)}</DraggableGrid>);
    expect(screen.getByText('scenes-widget')).toBeTruthy();
    expect(screen.getByText('activity-widget')).toBeTruthy();
    // saved order kept for existing widgets
    const texts = screen.getAllByText(/-widget$/).map((n) => n.textContent);
    expect(texts[0]).toBe('arduino-widget');
  });
});
