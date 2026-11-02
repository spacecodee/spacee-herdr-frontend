import { Service } from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { binaryToBytes, textToBytes } from './input-bytes';

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
  /** Typed, pasted or binary input as the bytes core expects. Returns an unsubscribe function. */
  onInput(callback: (bytes: Uint8Array) => void): () => void;
  onResize(callback: (size: { cols: number; rows: number }) => void): () => void;
  onFocus(callback: (focused: boolean) => void): () => void;
  /** Disposes observers, listeners and the xterm instance. */
  dispose(): void;
}

export const TERMINAL_THEME = {
  background: '#0b0b0c',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
} as const;

const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

@Service()
export class XtermFactory {
  /** Creates an xterm in `container`, already opened and fitted. */
  create(container: HTMLElement): XtermHandle {
    const term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: 13,
      scrollback: 5000,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { ...TERMINAL_THEME },
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
      display: () => ({
        bg: TERMINAL_THEME.background,
        fg: TERMINAL_THEME.foreground,
        cursor: TERMINAL_THEME.cursor,
        cell: cellSize(container, term),
      }),
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
        observer?.disconnect();
        for (const s of subscriptions) s.dispose();
        term.dispose();
      },
    };
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
