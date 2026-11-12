import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DraggableGrid from './DraggableGrid';

// Must mirror WIDGET_KEYS
const KEYS = ['weather', 'sports', 'calendar', 'quickcontrols', 'spotify', 'news', 'govee', 'crealityprinter', 'phillips_hue', 'scenes', 'activity', 'frametv'];
const renderAll = () => render(<DraggableGrid>{KEYS.map((k) => <div key={k}>{k}-widget</div>)}</DraggableGrid>);
const order = () => screen.getAllByText(/-widget$/).map((n) => n.textContent.replace('-widget', ''));

describe('DraggableGrid', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows widgets added after a layout was saved (regression: new widgets never appeared)', () => {
    localStorage.setItem('batcomputer_widget_order', JSON.stringify(KEYS.slice(0, 9).reverse()));
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

  it('places widgets by their key, so removing or reordering children never shifts the others', () => {
    // children in a scrambled order with a hidden one (false) and an unknown one
    const kids = ['news', 'weather', false, 'frametv', 'govee'].map((k) => k && <div key={k}>{k}-widget</div>);
    render(<DraggableGrid>{kids}</DraggableGrid>);
    expect(order()).toEqual(['weather', 'news', 'govee', 'frametv']);   // WIDGET_KEYS order, by key
  });

  it('touch screens: move buttons reorder in edit mode, and the order is saved (Nov 11: iPhone drag just scrolled)', () => {
    render(<DraggableGrid editMode onEditModeChange={() => {}}>{KEYS.map((k) => <div key={k}>{k}-widget</div>)}</DraggableGrid>);
    fireEvent.click(screen.getByLabelText('Move sports earlier'));
    expect(order().slice(0, 2)).toEqual(['sports', 'weather']);
    fireEvent.click(screen.getByLabelText('Move frametv to the start'));
    expect(order()[0]).toBe('frametv');
    fireEvent.click(screen.getByLabelText('Move frametv later'));
    expect(order().slice(0, 2)).toEqual(['sports', 'frametv']);
    expect(JSON.parse(localStorage.getItem('batcomputer_widget_order')).slice(0, 2)).toEqual(['sports', 'frametv']);
    expect(screen.getByLabelText('Move sports earlier').disabled).toBe(true);   // already first
  });

  it('no move buttons outside edit mode', () => {
    renderAll();
    expect(screen.queryByLabelText(/^Move /)).toBeNull();
  });
});
