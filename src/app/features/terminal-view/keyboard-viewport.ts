/** Smaller than any on-screen keyboard; larger than the status-bar mismatch iOS reports in standalone mode. */
const KEYBOARD_MIN_HEIGHT = 150;

export interface KeyboardViewport {
  height: number;
  top: number;
}

/**
 * The visible area above the iOS keyboard, or null when no keyboard is up. Without a keyboard the
 * layout viewport (`dvh`) is right: in the installed app `visualViewport.height` can come back
 * shorter than the screen and would leave an empty band under the key bar.
 */
export function keyboardViewport(v: {
  innerHeight: number;
  height: number;
  offsetTop: number;
}): KeyboardViewport | null {
  if (v.innerHeight - v.height < KEYBOARD_MIN_HEIGHT) return null;
  return { height: v.height, top: v.offsetTop };
}
