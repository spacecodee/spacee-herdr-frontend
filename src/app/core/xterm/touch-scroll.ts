/** Finger travel (px) under which a touch stays a tap. */
const TAP_SLOP = 8;

interface Drag {
  lastY: number;
  startX: number;
  startY: number;
  scrolling: boolean;
}

/** Turns vertical one-finger drags on `target` into wheel events on `wheelTarget`. Returns a disposer. */
export function attachTouchScroll(
  target: HTMLElement,
  wheelTarget: () => Element | null,
): () => void {
  let drag: Drag | null = null;

  const onStart = (e: TouchEvent) => {
    // Never preventDefault here: a tap must still focus xterm and open the keyboard.
    if (e.touches.length !== 1) {
      drag = null;
      return;
    }
    const { clientX, clientY } = e.touches[0];
    drag = { lastY: clientY, startX: clientX, startY: clientY, scrolling: false };
  };

  const onMove = (e: TouchEvent) => {
    if (!drag || e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
    if (!drag.scrolling) {
      if (Math.abs(clientY - drag.startY) < TAP_SLOP) return;
      drag.scrolling = true;
    }
    // Stops the page from scrolling or bouncing; needs the non-passive listener below.
    e.preventDefault();
    // Dragging up (y decreasing) scrolls towards newer output, like native scrolling.
    const deltaY = drag.lastY - clientY;
    drag.lastY = clientY;
    if (deltaY === 0) return;
    const wheel = new WheelEvent('wheel', {
      deltaY,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    });
    // xterm 6 scrolls from the legacy `wheelDeltaY`, which a synthetic event gets with the same
    // sign as `deltaY`; a real wheel has the opposite sign.
    Object.defineProperty(wheel, 'wheelDeltaY', { value: -deltaY });
    Object.defineProperty(wheel, 'wheelDelta', { value: -deltaY });
    wheelTarget()?.dispatchEvent(wheel);
  };

  const onEnd = () => {
    drag = null;
  };

  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchmove', onMove, { passive: false });
  target.addEventListener('touchend', onEnd);
  target.addEventListener('touchcancel', onEnd);
  return () => {
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onEnd);
  };
}
