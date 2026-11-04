import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Bomb({ explode }) {
  if (explode) throw new Error("Cannot read properties of undefined (reading 'on')");
  return <div>light ok</div>;
}

describe('ErrorBoundary', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('keeps a crashing widget inside its card (regression: black screen)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary name="hue"><Bomb explode /></ErrorBoundary>
        <ErrorBoundary name="weather"><div>weather ok</div></ErrorBoundary>
      </div>
    );
    expect(screen.getByText(/HUE stopped working/)).toBeTruthy();
    expect(screen.getByText(/reading 'on'/)).toBeTruthy();
    expect(screen.getByText('weather ok')).toBeTruthy(); // the rest of the panel survives
  });

  it('Retry re-renders the child', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let explode = true;
    const Flaky = () => <Bomb explode={explode} />;
    render(<ErrorBoundary name="hue"><Flaky /></ErrorBoundary>);
    explode = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('light ok')).toBeTruthy();
  });
});
