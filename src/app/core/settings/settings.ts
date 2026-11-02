import { Service, signal } from '@angular/core';

const STORAGE_KEY = 'spacee-herdr.settings';
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 12;

const valid = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE;

/** User preferences, kept in localStorage. Storage failures never break the session value. */
@Service()
export class Settings {
  private readonly fontSize = signal(readFontSize());
  /** Terminal text size in px. */
  readonly terminalFontSize = this.fontSize.asReadonly();

  setTerminalFontSize(n: number): void {
    const size = Number.isFinite(n)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)))
      : this.fontSize();
    this.fontSize.set(size);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ terminalFontSize: size }));
    } catch {
      // private mode or quota: the value still applies for this session
    }
  }
}

function readFontSize(): number {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      terminalFontSize?: unknown;
    } | null;
    return valid(stored?.terminalFontSize) ? stored.terminalFontSize : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}
