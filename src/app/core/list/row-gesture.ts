/** How far a swipe slides the row; the Rename and Close buttons come in over its right side. */
export const SWIPE_TRAVEL = 56;
/** How long a finger must rest on a row to open its menu. */
export const LONG_PRESS_MS = 450;
/** Movement under this many pixels still counts as holding still. */
const SLOP = 8;

export interface RowGestureHost {
  /** The row follows the finger: horizontal offset in px, `-SWIPE_TRAVEL` (open) to 0 (closed). */
  drag(offset: number): void;
  /** The finger left or the gesture ended after a drag: settle open or closed. */
  release(open: boolean): void;
  longPress(): void;
}

/**
 * Tells a swipe, a long press and a scroll apart for one row. The first move past the slop decides:
 * mostly horizontal is a swipe (the row follows the finger), anything else is left to the browser
 * (scroll), and either cancels the long press timer.
 */
export class RowGesture {
  private start: { x: number; y: number; base: number } | null = null;
  private axis: 'x' | 'y' | null = null;
  private offset = 0;
  private pressed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: RowGestureHost) {}

  /** `open` is whether the actions are showing now, so a drag continues from there. */
  down(x: number, y: number, open: boolean): void {
    this.clear();
    this.start = { x, y, base: open ? -SWIPE_TRAVEL : 0 };
    this.axis = null;
    this.pressed = false;
    this.offset = this.start.base;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pressed = true;
      this.host.longPress();
    }, LONG_PRESS_MS);
  }

  /** True when the move belongs to a swipe, so the caller should keep the event. */
  move(x: number, y: number): boolean {
    const s = this.start;
    if (!s || this.pressed) return false;
    const dx = x - s.x;
    const dy = y - s.y;
    if (this.axis === null) {
      if (Math.abs(dx) <= SLOP && Math.abs(dy) <= SLOP) return false;
      this.clear();
      this.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (this.axis !== 'x') return false;
    this.offset = Math.min(0, Math.max(-SWIPE_TRAVEL, s.base + dx));
    this.host.drag(this.offset);
    return true;
  }

  /** The finger lifted: what happened, so the caller can swallow the click that follows. */
  up(): { swiped: boolean; longPressed: boolean } {
    const result = { swiped: this.axis === 'x', longPressed: this.pressed };
    this.finish();
    return result;
  }

  /** The browser took the pointer (a scroll) or the row went away. */
  cancel(): void {
    this.finish();
  }

  private finish(): void {
    this.clear();
    if (this.start && this.axis === 'x') this.host.release(this.offset < -SWIPE_TRAVEL / 2);
    this.start = null;
    this.axis = null;
  }

  private clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
