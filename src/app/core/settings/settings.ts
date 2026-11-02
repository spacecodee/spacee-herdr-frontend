import { Service, signal } from '@angular/core';

const STORAGE_KEY = 'spacee-herdr.settings';
export const MIN_FONT_SIZE = 9;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_FONT_SIZE = 12;
export const MIN_SCROLL_SPEED = 0.5;
export const MAX_SCROLL_SPEED = 5;
export const DEFAULT_SCROLL_SPEED = 2;

const valid = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE;

const validSpeed = (n: unknown): n is number =>
  typeof n === 'number' &&
  n >= MIN_SCROLL_SPEED &&
  n <= MAX_SCROLL_SPEED &&
  n * 2 === Math.round(n * 2);

/** User preferences, kept in localStorage. Storage failures never break the session value. */
@Service()
export class Settings {
  private readonly stored = readStored();
  private readonly fontSize = signal(
    valid(this.stored.terminalFontSize) ? this.stored.terminalFontSize : DEFAULT_FONT_SIZE,
  );
  private readonly speed = signal(
    validSpeed(this.stored.scrollSpeed) ? this.stored.scrollSpeed : DEFAULT_SCROLL_SPEED,
  );
  /** Terminal text size in px. */
  readonly terminalFontSize = this.fontSize.asReadonly();
  /** Touch scroll multiplier, 0.5 to 5 in steps of 0.5. */
  readonly scrollSpeed = this.speed.asReadonly();

  setTerminalFontSize(n: number): void {
    const size = Number.isFinite(n)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)))
      : this.fontSize();
    this.fontSize.set(size);
    this.persist();
  }

  setScrollSpeed(n: number): void {
    if (!Number.isFinite(n)) return;
    this.speed.set(Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, Math.round(n * 2) / 2)));
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ terminalFontSize: this.fontSize(), scrollSpeed: this.speed() }),
      );
    } catch {
      // private mode or quota: the value still applies for this session
    }
  }
}

interface Stored {
  terminalFontSize?: unknown;
  scrollSpeed?: unknown;
}

function readStored(): Stored {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return stored && typeof stored === 'object' ? (stored as Stored) : {};
  } catch {
    return {};
  }
}
