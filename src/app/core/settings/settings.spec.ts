import { TestBed } from '@angular/core/testing';
import { Settings } from './settings';

const KEY = 'spacee-herdr.settings';

/** In-memory localStorage: the test environment's own one is not reliable. */
function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
    ...overrides,
  } as Storage;
}

describe('Settings', () => {
  let localStorage: Storage;
  beforeEach(() => {
    localStorage = fakeStorage();
    vi.stubGlobal('localStorage', localStorage);
  });
  afterEach(() => vi.unstubAllGlobals());

  const create = () => TestBed.inject(Settings);

  it('defaults the terminal font size to 12', () => {
    expect(create().terminalFontSize()).toBe(12);
  });

  it('clamps to 9..20 and rounds', () => {
    const s = create();
    s.setTerminalFontSize(3);
    expect(s.terminalFontSize()).toBe(9);
    s.setTerminalFontSize(99);
    expect(s.terminalFontSize()).toBe(20);
    s.setTerminalFontSize(14.6);
    expect(s.terminalFontSize()).toBe(15);
    s.setTerminalFontSize(Number.NaN);
    expect(s.terminalFontSize()).toBe(15);
  });

  it('persists as JSON and reads it back in a new instance', () => {
    create().setTerminalFontSize(16);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      terminalFontSize: 16,
      scrollSpeed: 2,
      inputMode: 'compose',
    });
    TestBed.resetTestingModule();
    expect(create().terminalFontSize()).toBe(16);
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['out-of-range', JSON.stringify({ terminalFontSize: 40 })],
    ['non-numeric', JSON.stringify({ terminalFontSize: 'big' })],
    ['fractional', JSON.stringify({ terminalFontSize: 12.5 })],
    ['not an object', 'null'],
  ])('falls back to the default on %s', (_name, stored) => {
    localStorage.setItem(KEY, stored);
    expect(create().terminalFontSize()).toBe(12);
  });

  it('still applies the value for the session when storage throws', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        setItem: () => {
          throw new Error('quota');
        },
      }),
    );
    const s = create();
    s.setTerminalFontSize(18);
    expect(s.terminalFontSize()).toBe(18);
  });

  it('uses the default when reading storage throws', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    );
    expect(create().terminalFontSize()).toBe(12);
  });

  describe('scrollSpeed', () => {
    it('defaults to 2', () => {
      expect(create().scrollSpeed()).toBe(2);
    });

    it('clamps to 0.5..5 and rounds to steps of 0.5', () => {
      const s = create();
      s.setScrollSpeed(0.1);
      expect(s.scrollSpeed()).toBe(0.5);
      s.setScrollSpeed(9);
      expect(s.scrollSpeed()).toBe(5);
      s.setScrollSpeed(1.3);
      expect(s.scrollSpeed()).toBe(1.5);
      s.setScrollSpeed(Number.NaN);
      expect(s.scrollSpeed()).toBe(1.5);
    });

    it('persists next to the font size and keeps both', () => {
      const s = create();
      s.setTerminalFontSize(15);
      s.setScrollSpeed(3.5);
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
        terminalFontSize: 15,
        scrollSpeed: 3.5,
        inputMode: 'compose',
      });
      TestBed.resetTestingModule();
      const again = create();
      expect(again.scrollSpeed()).toBe(3.5);
      expect(again.terminalFontSize()).toBe(15);
    });

    it('keeps an old stored object without the key working', () => {
      localStorage.setItem(KEY, JSON.stringify({ terminalFontSize: 14 }));
      const s = create();
      expect(s.terminalFontSize()).toBe(14);
      expect(s.scrollSpeed()).toBe(2);
    });

    it.each([['9'], ['"fast"'], ['1.3'], ['0'], ['null']])(
      'falls back to the default for stored %s without touching the font size',
      (value) => {
        localStorage.setItem(KEY, `{"terminalFontSize":16,"scrollSpeed":${value}}`);
        const s = create();
        expect(s.scrollSpeed()).toBe(2);
        expect(s.terminalFontSize()).toBe(16);
      },
    );
  });

  describe('inputMode', () => {
    it('defaults to compose', () => {
      expect(create().inputMode()).toBe('compose');
    });

    it('persists and reads back', () => {
      create().setInputMode('direct');
      expect(JSON.parse(localStorage.getItem(KEY)!).inputMode).toBe('direct');
      TestBed.resetTestingModule();
      expect(create().inputMode()).toBe('direct');
    });

    it('keeps the other values when it changes', () => {
      const s = create();
      s.setTerminalFontSize(15);
      s.setInputMode('direct');
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
        terminalFontSize: 15,
        scrollSpeed: 2,
        inputMode: 'direct',
      });
    });

    it.each([['"voice"'], ['3'], ['null']])('falls back to compose for stored %s', (value) => {
      localStorage.setItem(KEY, `{"inputMode":${value}}`);
      expect(create().inputMode()).toBe('compose');
    });

    it('ignores an invalid value', () => {
      const s = create();
      s.setInputMode('nope' as never);
      expect(s.inputMode()).toBe('compose');
    });
  });
});
