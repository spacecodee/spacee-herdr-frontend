import { Service } from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { binaryToBytes, textToBytes } from './input-bytes';
import { TERMINAL_THEMES, type Scheme } from './terminal-themes';
import { attachTouchScroll } from './touch-scroll';
import { attachTouchSelection } from './touch-selection';

/** What core's `terminal.attach` wants to know about this viewer (`Display` in the schema). */
export interface DisplayFacts {
  bg: string | null;
  fg: string | null;
  cursor: string | null;
  /** Cell size in pixels: [width, height]. */
  cell: [number, number] | null;
}

/** The small surface of xterm the terminal view needs; specs swap in a fake. */
export interface XtermHandle {
  readonly cols: number;
  readonly rows: number;
  /** xterm's DECCKM: arrows are `ESC O x` instead of `ESC [ x` while an app asks for it. */
  readonly applicationCursorKeys: boolean;
  fit(): void;
  /** Resolves once xterm has really consumed the bytes (that is when credit may go back). */
  write(bytes: Uint8Array): Promise<void>;
  reset(): void;
  focus(): void;
  display(): DisplayFacts;
  /**
   * Pastes like the user would: bracketed paste when the program asked for it, newlines as CR. The
   * result comes out through `onInput`.
   */
  paste(text: string): void;
  /**
   * Whether tapping the screen may open the on-screen keyboard. Off in compose mode, where the
   * message field owns the keyboard; selection and scrolling still work.
   */
  setNativeKeyboard(on: boolean): void;
  /**
   * Switches the palette. No FACTS frame is sent (its payload format is unverified), so core only
   * learns the new colors on the next attach.
   */
  setScheme(scheme: Scheme): void;
  /** Touch scroll multiplier (applies live). */
  setScrollSpeed(speed: number): void;
  /** Sets the text size in px and refits; the resize path then tells core the new cols/rows. */
  setFontSize(size: number): void;
  /** Typed, pasted or binary input as the bytes core expects. Returns an unsubscribe function. */
  onInput(callback: (bytes: Uint8Array) => void): () => void;
  onResize(callback: (size: { cols: number; rows: number }) => void): () => void;
  onFocus(callback: (focused: boolean) => void): () => void;
  /** Disposes observers, listeners and the xterm instance. */
  dispose(): void;
}

const FALLBACK_FONTS =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
/** Bundled Nerd Font (see @font-face in styles.css); the phone has none, so prompt icons need it. */
export const TERMINAL_FONT_FAMILY = `"JetBrainsMono NFM", ${FALLBACK_FONTS}`;
const NERD_FONT_FACES = ['400 12px "JetBrainsMono NFM"', '700 12px "JetBrainsMono NFM"'];

@Service()
export class XtermFactory {
  /** Creates an xterm in `container`, already opened and fitted. */
  create(
    container: HTMLElement,
    scheme: Scheme,
    fontSize: number,
    scrollSpeed: number,
  ): XtermHandle {
    let current = scheme;
    const term = new Terminal({
      fontFamily: TERMINAL_FONT_FAMILY,
      scrollSensitivity: scrollSpeed,
      fontSize,
      scrollback: 5000,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { ...TERMINAL_THEMES[scheme] },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.open(container);
    loadWebgl(term);

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        // container not laid out yet; the next observer tick fits it
      }
    };
    doFit();

    // xterm 6 scrolls from a scrollable element that sits above `.xterm-screen` and stops the event
    // there, so touch drags are replayed as wheel events on the screen, the deepest node.
    const stopTouchScroll = attachTouchScroll(container, () =>
      container.querySelector('.xterm-screen'),
    );

    const stopTouchSelection = attachTouchSelection(container, term);

    let disposed = false;
    // xterm measures glyphs (and the WebGL atlas caches them) when it opens. If the Nerd Font
    // arrives later, re-apply the family so it remeasures, then drop the atlas and refit. A failed
    // load just leaves the fallback fonts.
    void loadNerdFont().then((loaded) => {
      if (!loaded || disposed) return;
      term.options.fontFamily = FALLBACK_FONTS;
      term.options.fontFamily = TERMINAL_FONT_FAMILY;
      term.clearTextureAtlas();
      doFit();
      term.refresh(0, term.rows - 1);
    });

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(doFit);
    observer?.observe(container);

    const subscriptions: { dispose(): void }[] = [];
    const unsub = (d: { dispose(): void }) => () => d.dispose();

    return {
      get cols() {
        return term.cols;
      },
      get rows() {
        return term.rows;
      },
      get applicationCursorKeys() {
        return term.modes.applicationCursorKeysMode;
      },
      fit: doFit,
      write: (bytes) => new Promise<void>((resolve) => term.write(bytes, resolve)),
      reset: () => term.reset(),
      focus: () => term.focus(),
      paste: (text) => term.paste(text),
      setNativeKeyboard: (on) => {
        if (!term.textarea) return;
        if (on) term.textarea.removeAttribute('inputmode');
        else term.textarea.setAttribute('inputmode', 'none');
      },
      display: () => ({
        bg: TERMINAL_THEMES[current].background ?? null,
        fg: TERMINAL_THEMES[current].foreground ?? null,
        cursor: TERMINAL_THEMES[current].cursor ?? null,
        cell: cellSize(container, term),
      }),
      setScheme: (next) => {
        current = next;
        term.options.theme = { ...TERMINAL_THEMES[next] };
      },
      setScrollSpeed: (speed) => {
        term.options.scrollSensitivity = speed;
      },
      setFontSize: (size) => {
        if (term.options.fontSize === size) return;
        term.options.fontSize = size;
        doFit();
      },
      onInput: (callback) => {
        const data = term.onData((s) => callback(textToBytes(s)));
        const binary = term.onBinary((s) => callback(binaryToBytes(s)));
        subscriptions.push(data, binary);
        return () => {
          data.dispose();
          binary.dispose();
        };
      },
      onResize: (callback) => {
        const d = term.onResize(callback);
        subscriptions.push(d);
        return unsub(d);
      },
      onFocus: (callback) => {
        const textarea = term.textarea;
        if (!textarea) return () => undefined;
        const focus = () => callback(true);
        const blur = () => callback(false);
        textarea.addEventListener('focus', focus);
        textarea.addEventListener('blur', blur);
        const remove = () => {
          textarea.removeEventListener('focus', focus);
          textarea.removeEventListener('blur', blur);
        };
        subscriptions.push({ dispose: remove });
        return remove;
      },
      dispose: () => {
        disposed = true;
        stopTouchScroll();
        stopTouchSelection();
        observer?.disconnect();
        for (const s of subscriptions) s.dispose();
        term.dispose();
      },
    };
  }
}

/** Resolves true when both weights are ready; never rejects and never waits on a missing font. */
async function loadNerdFont(): Promise<boolean> {
  try {
    const fonts = (globalThis.document as Document | undefined)?.fonts;
    if (!fonts) return false;
    const results = await Promise.all(NERD_FONT_FACES.map((face) => fonts.load(face)));
    return results.every((faces) => faces.length > 0);
  } catch {
    return false;
  }
}

/** WebGL when the browser has it; on failure or context loss xterm keeps its default renderer. */
function loadWebgl(term: Terminal): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
  } catch {
    // no WebGL2: default renderer
  }
}

/** Measured from the rendered screen, so no private xterm API is involved. */
function cellSize(container: HTMLElement, term: Terminal): [number, number] | null {
  const screen = container.querySelector<HTMLElement>('.xterm-screen');
  if (!screen || term.cols === 0 || term.rows === 0) return null;
  const width = Math.round(screen.clientWidth / term.cols);
  const height = Math.round(screen.clientHeight / term.rows);
  return width > 0 && height > 0 ? [width, height] : null;
}
