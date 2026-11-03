import { TestBed } from '@angular/core/testing';
import { UsageDisplay } from './usage-display';

const KEY = 'spacee-herdr.usage-remaining';

/** In-memory localStorage: the test environment's own one is not reliable. */
function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    ...overrides,
  } as Storage;
}

describe('UsageDisplay', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());
  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(UsageDisplay);
  };

  it('shows used by default', () => expect(create().remaining()).toBe(false));

  it('keeps the choice', () => {
    create().set(true);
    expect(storage.getItem(KEY)).toBe('1');
    expect(create().remaining()).toBe(true);
    create().set(false);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('works when storage throws', () => {
    vi.stubGlobal('localStorage', fakeStorage({ setItem: () => { throw new Error('full'); }, getItem: () => { throw new Error('no'); } }));
    const d = create();
    expect(d.remaining()).toBe(false);
    d.set(true);
    expect(d.remaining()).toBe(true);
  });
});
