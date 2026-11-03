import { clearDraft, loadDraft, saveDraft } from './draft';

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

describe('draft', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('starts empty', () => {
    expect(loadDraft('rohan/t7')).toBe('');
  });

  it('stores text per address', () => {
    saveDraft('rohan/t7', 'ls -la');
    saveDraft('rohan/t8', 'pwd');
    expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBe('ls -la');
    expect(loadDraft('rohan/t7')).toBe('ls -la');
    expect(loadDraft('rohan/t8')).toBe('pwd');
  });

  it('removes the key when the text is empty', () => {
    saveDraft('rohan/t7', 'x');
    saveDraft('rohan/t7', '');
    expect(localStorage.getItem('spacee-herdr.draft.rohan/t7')).toBeNull();
  });

  it('clearDraft removes it', () => {
    saveDraft('rohan/t7', 'x');
    clearDraft('rohan/t7');
    expect(loadDraft('rohan/t7')).toBe('');
  });

  it('ignores storage errors', () => {
    const boom = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('localStorage', fakeStorage({ getItem: boom, setItem: boom, removeItem: boom }));
    expect(loadDraft('a')).toBe('');
    expect(() => saveDraft('a', 'x')).not.toThrow();
    expect(() => clearDraft('a')).not.toThrow();
  });
});
