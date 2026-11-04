import { describe, it, expect } from 'vitest';
import { inferCapabilities } from './goveeCapabilities';

describe('Govee capabilities come from supportCmds', () => {
  it('rope lights get color + brightness', () => {
    const c = inferCapabilities({ model: 'H61A2', supportCmds: ['turn', 'brightness', 'color', 'colorTem'] });
    expect(c).toMatchObject({ power: true, brightness: true, color: true, temperature: true, readOnly: false });
  });
  it('smart plugs only get power (no fake color picker)', () => {
    expect(inferCapabilities({ model: 'H5086', supportCmds: ['turn'] })).toMatchObject({ power: true, color: false, brightness: false });
  });
  it('H6076 stays power-only by the documented quirk', () => {
    const c = inferCapabilities({ model: 'H6076', supportCmds: ['turn', 'brightness', 'color', 'colorTem'] });
    expect(c).toMatchObject({ power: true, color: false, brightness: false, readOnly: true });
  });
});
