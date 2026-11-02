import { TestBed } from '@angular/core/testing';
import { ColorScheme } from './color-scheme';

class FakeMql {
  listeners: ((e: { matches: boolean }) => void)[] = [];
  constructor(public matches: boolean) {}
  addEventListener(_t: string, cb: (e: { matches: boolean }) => void) {
    this.listeners.push(cb);
  }
  removeEventListener() {}
  flip(matches: boolean) {
    this.matches = matches;
    for (const l of this.listeners) l({ matches });
  }
}

describe('ColorScheme', () => {
  const root = document.documentElement;
  afterEach(() => {
    vi.unstubAllGlobals();
    root.classList.remove('dark');
  });

  it('follows prefers-color-scheme and toggles the dark class live', () => {
    const mql = new FakeMql(true);
    vi.stubGlobal('matchMedia', (q: string) => {
      expect(q).toBe('(prefers-color-scheme: dark)');
      return mql;
    });
    const s = TestBed.inject(ColorScheme);
    TestBed.tick();
    expect(s.scheme()).toBe('dark');
    expect(root.classList.contains('dark')).toBe(true);
    mql.flip(false);
    TestBed.tick();
    expect(s.scheme()).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('is light when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const s = TestBed.inject(ColorScheme);
    TestBed.tick();
    expect(s.scheme()).toBe('light');
    expect(root.classList.contains('dark')).toBe(false);
  });
});
