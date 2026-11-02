export type BarKey = 'esc' | 'tab' | 'up' | 'down' | 'right' | 'left' | 'enter';

const ARROW_FINAL: Record<'up' | 'down' | 'right' | 'left', number> = {
  up: 0x41,
  down: 0x42,
  right: 0x43,
  left: 0x44,
};

const ESC = 0x1b;

/** Bytes for a bar key. `appCursor` is xterm's DECCKM (application cursor keys) mode. */
export function barKeyBytes(key: BarKey, opts: { ctrl: boolean; appCursor: boolean }): Uint8Array {
  if (key === 'esc') return Uint8Array.of(ESC);
  if (key === 'tab') return Uint8Array.of(0x09);
  if (key === 'enter') return Uint8Array.of(0x0d);
  const final = ARROW_FINAL[key];
  if (opts.ctrl) return Uint8Array.of(ESC, 0x5b, 0x31, 0x3b, 0x35, final);
  return Uint8Array.of(ESC, opts.appCursor ? 0x4f : 0x5b, final);
}

/** Ctrl applied to keyboard input; returns null when the input has no Ctrl form. */
export function ctrlBytes(input: Uint8Array): Uint8Array | null {
  if (input.length !== 1) return null;
  const b = input[0];
  if (b === 0x20) return Uint8Array.of(0x00);
  if (b === 0x3f) return Uint8Array.of(0x7f);
  // '@', 'A'-'Z', '[', '\', ']', '^', '_' and 'a'-'z'
  if ((b >= 0x40 && b <= 0x5f) || (b >= 0x61 && b <= 0x7a)) return Uint8Array.of(b & 0x1f);
  return null;
}
