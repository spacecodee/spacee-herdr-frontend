import { TERMINAL_THEMES, type Scheme } from './terminal-themes';

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ANSI = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

const NEUTRAL = new Set(['black', 'white', 'brightBlack', 'brightWhite']);

describe('TERMINAL_THEMES', () => {
  it('blends with the app background', () => {
    expect(TERMINAL_THEMES.light.background).toBe('#ffffff');
    expect(TERMINAL_THEMES.dark.background).toBe('#0a0a0a');
    expect(TERMINAL_THEMES.light.foreground).toBe('#0a0a0a');
    expect(TERMINAL_THEMES.light.cursor).toBe('#0a0a0a');
    expect(TERMINAL_THEMES.dark.foreground).toBe('#fafafa');
    expect(TERMINAL_THEMES.dark.cursor).toBe('#fafafa');
  });

  describe.each<Scheme>(['light', 'dark'])('%s', (scheme) => {
    const theme = TERMINAL_THEMES[scheme];
    const bg = theme.background!;

    it('sets cursorAccent and selectionBackground', () => {
      expect(theme.cursorAccent).toMatch(/^#/);
      expect(theme.selectionBackground).toBeTruthy();
    });

    it('sets all 16 ANSI colors', () => {
      for (const name of ANSI) expect(theme[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('has foreground vs background contrast of at least 7:1', () => {
      expect(contrast(theme.foreground!, bg)).toBeGreaterThanOrEqual(7);
    });

    it('keeps every colored ANSI entry at 3:1 or more against the background', () => {
      for (const name of ANSI.filter((n) => !NEUTRAL.has(n)))
        expect(contrast(theme[name]!, bg), name).toBeGreaterThanOrEqual(3);
    });
  });

  it('keeps white and brightWhite visible on the light background', () => {
    for (const name of ['white', 'brightWhite'] as const)
      expect(contrast(TERMINAL_THEMES.light[name]!, '#ffffff'), name).toBeGreaterThan(1.2);
  });
});
