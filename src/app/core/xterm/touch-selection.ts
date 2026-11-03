/** Finger travel (px) under which a touch is a tap, as in touch-scroll. */
const TAP_SLOP = 8;
/** Touches shorter than this (ms) are taps; longer ones are long presses. */
const TAP_MS = 500;
/** iOS sends compatibility mouse events this long (ms) after a touch. */
const MOUSE_AFTER_TOUCH_MS = 1000;

/** The part of xterm's selection this needs; the browser's own selection is handled directly. */
export interface Selectable {
  hasSelection(): boolean;
  clearSelection(): void;
}

/**
 * Touch selection rules for the terminal on iOS:
 * - a tap anywhere clears a selection (xterm's and the browser's), so a highlight never sticks;
 * - the double and triple tap iOS turns into a mouse double/triple click never selects a word or a
 *   line, so a plain tap cannot select;
 * - a long press and a drag are left alone (selecting by long press, scrolling).
 * Returns a disposer.
 */
export function attachTouchSelection(
  target: HTMLElement,
  term: Selectable,
  doc: Document = target.ownerDocument,
): () => void {
  let start: { x: number; y: number; at: number } | null = null;
  let lastTouchAt = Number.NEGATIVE_INFINITY;

  const clear = () => {
    if (term.hasSelection()) term.clearSelection();
    const native = doc.defaultView?.getSelection();
    if (native && native.rangeCount > 0) native.removeAllRanges();
  };

  const onStart = (e: TouchEvent) => {
    lastTouchAt = performance.now();
    if (e.touches.length !== 1) {
      start = null;
      return;
    }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: lastTouchAt };
  };

  const onEnd = (e: TouchEvent) => {
    const began = start;
    start = null;
    const end = e.changedTouches?.[0];
    if (!began || !end) return;
    const tapped =
      Math.abs(end.clientX - began.x) < TAP_SLOP &&
      Math.abs(end.clientY - began.y) < TAP_SLOP &&
      performance.now() - began.at < TAP_MS;
    if (tapped) clear();
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.detail > 1 && performance.now() - lastTouchAt < MOUSE_AFTER_TOUCH_MS) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  doc.addEventListener('touchstart', onStart, { capture: true, passive: true });
  doc.addEventListener('touchend', onEnd, { capture: true, passive: true });
  target.addEventListener('mousedown', onMouseDown, { capture: true });
  return () => {
    doc.removeEventListener('touchstart', onStart, { capture: true });
    doc.removeEventListener('touchend', onEnd, { capture: true });
    target.removeEventListener('mousedown', onMouseDown, { capture: true });
  };
}
