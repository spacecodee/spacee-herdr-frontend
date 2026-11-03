import { keyboardViewport } from './keyboard-viewport';

describe('keyboardViewport', () => {
  it('is null when the visual viewport is the full window', () => {
    expect(keyboardViewport({ innerHeight: 844, height: 844, offsetTop: 0 })).toBeNull();
  });

  it('ignores a short visual viewport that is not a keyboard (standalone status bar quirk)', () => {
    expect(keyboardViewport({ innerHeight: 844, height: 797, offsetTop: 0 })).toBeNull();
  });

  it('returns the visible area when the keyboard is up', () => {
    expect(keyboardViewport({ innerHeight: 844, height: 520, offsetTop: 0 })).toEqual({
      height: 520,
      top: 0,
    });
  });

  it('keeps the scroll offset while the keyboard is up', () => {
    expect(keyboardViewport({ innerHeight: 844, height: 520, offsetTop: 12 })).toEqual({
      height: 520,
      top: 12,
    });
  });
});
