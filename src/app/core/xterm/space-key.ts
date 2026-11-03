/**
 * A plain space keydown, which xterm 6 does not turn into input itself: its keydown mapping only
 * takes printable keys from keyCode 48 up, leaving space to `keypress`. iOS Safari fires no
 * `keypress` for the on-screen keyboard, and xterm drops the following `input` event because a
 * keydown was seen, so the space never reached the terminal. Modified spaces (Ctrl+Space as NUL,
 * Alt+Space as ESC space) and IME composition stay with xterm.
 */
export function isPlainSpace(event: KeyboardEvent): boolean {
  return (
    event.type === 'keydown' &&
    event.key === ' ' &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  );
}
