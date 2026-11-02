import { HISTORY_LIMIT, loadHistory, pushHistory, suggestions } from './history';

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

describe('history', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts empty', () => {
    expect(loadHistory('rohan/t7')).toEqual([]);
  });

  it('stores most recent first under a per-address key', () => {
    pushHistory('rohan/t7', 'ls');
    pushHistory('rohan/t7', 'pwd');
    expect(loadHistory('rohan/t7')).toEqual(['pwd', 'ls']);
    expect(JSON.parse(storage.getItem('spacee-herdr.history.rohan/t7')!)).toEqual(['pwd', 'ls']);
    expect(loadHistory('rohan/t8')).toEqual([]);
  });

  it('skips a consecutive duplicate but keeps an older one', () => {
    pushHistory('a', 'ls');
    pushHistory('a', 'ls');
    expect(loadHistory('a')).toEqual(['ls']);
    pushHistory('a', 'pwd');
    pushHistory('a', 'ls');
    expect(loadHistory('a')).toEqual(['ls', 'pwd', 'ls']);
  });

  it('keeps the last 50', () => {
    for (let i = 0; i < 60; i++) pushHistory('a', `cmd ${i}`);
    const list = loadHistory('a');
    expect(HISTORY_LIMIT).toBe(50);
    expect(list).toHaveLength(50);
    expect(list[0]).toBe('cmd 59');
    expect(list[49]).toBe('cmd 10');
  });

  it('ignores empty text', () => {
    pushHistory('a', '');
    expect(loadHistory('a')).toEqual([]);
  });

  it.each([['{nope'], ['"str"'], ['[1,"a"]'], ['null']])('reads %s as empty or filtered', (raw) => {
    storage.setItem('spacee-herdr.history.a', raw);
    const list = loadHistory('a');
    expect(list.every((e) => typeof e === 'string')).toBe(true);
    expect(list).toEqual(raw === '[1,"a"]' ? ['a'] : []);
  });

  it('ignores storage errors and still returns the new list', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('quota');
        },
      }),
    );
    expect(loadHistory('a')).toEqual([]);
    expect(pushHistory('a', 'ls')).toEqual(['ls']);
  });

  describe('suggestions', () => {
    const list = ['git status', 'git push', 'ls -la', 'Git log', 'git stash', 'git add'];

    it('is empty for empty text', () => {
      expect(suggestions(list, '')).toEqual([]);
    });

    it('matches the start, case-insensitively, at most 3, in order', () => {
      expect(suggestions(list, 'git')).toEqual(['git status', 'git push', 'Git log']);
    });

    it('excludes an exact match', () => {
      expect(suggestions(list, 'git push')).toEqual([]);
      expect(suggestions(list, 'git s')).toEqual(['git status', 'git stash']);
    });

    it('does not match in the middle', () => {
      expect(suggestions(list, 'status')).toEqual([]);
    });
  });
});
