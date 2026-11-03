import { describe, expect, it } from 'vitest';
import { isPlainSpace } from './space-key';

const key = (init: KeyboardEventInit & { type?: string }) =>
  new KeyboardEvent(init.type ?? 'keydown', { key: ' ', keyCode: 32, ...init } as KeyboardEventInit);

describe('isPlainSpace', () => {
  it('is true for a plain space keydown (iOS sends no keypress for it)', () => {
    expect(isPlainSpace(key({}))).toBe(true);
    expect(isPlainSpace(key({ shiftKey: true }))).toBe(true);
  });

  it('leaves modified spaces to xterm (Ctrl+Space is NUL, Alt+Space is ESC space)', () => {
    expect(isPlainSpace(key({ ctrlKey: true }))).toBe(false);
    expect(isPlainSpace(key({ altKey: true }))).toBe(false);
    expect(isPlainSpace(key({ metaKey: true }))).toBe(false);
  });

  it('ignores keypress, keyup, IME composition and other keys', () => {
    expect(isPlainSpace(key({ type: 'keypress' }))).toBe(false);
    expect(isPlainSpace(key({ type: 'keyup' }))).toBe(false);
    expect(isPlainSpace(key({ isComposing: true }))).toBe(false);
    expect(isPlainSpace(key({ key: 'a', keyCode: 65 }))).toBe(false);
  });
});
