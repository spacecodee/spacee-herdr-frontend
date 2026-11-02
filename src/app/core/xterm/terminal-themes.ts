import type { ITheme } from '@xterm/xterm';

export type Scheme = 'light' | 'dark';

/**
 * ANSI palettes are GitHub Primer's light and dark terminal colors. `background` matches the app's
 * `--background` token for each scheme (see styles.css), so the terminal blends with the page.
 */
export const TERMINAL_THEMES: Record<Scheme, ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#0a0a0a',
    cursor: '#0a0a0a',
    cursorAccent: '#ffffff',
    selectionBackground: '#b6d6fb',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#4d2d00',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#1a7f37',
    brightYellow: '#633c01',
    brightBlue: '#0550ae',
    brightMagenta: '#6639ba',
    brightCyan: '#3192aa',
    brightWhite: '#8c959f',
  },
  dark: {
    background: '#0a0a0a',
    foreground: '#fafafa',
    cursor: '#fafafa',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  },
};
