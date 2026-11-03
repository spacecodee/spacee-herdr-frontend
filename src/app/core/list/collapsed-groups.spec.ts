import { TestBed } from '@angular/core/testing';
import { CollapsedGroups, COLLAPSED_KEY } from './collapsed-groups';

function fakeStorage(initial?: string): Storage {
  const data = new Map<string, string>(initial === undefined ? [] : [[COLLAPSED_KEY, initial]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('CollapsedGroups', () => {
  const make = (initial?: string) => {
    const storage = fakeStorage(initial);
    vi.stubGlobal('localStorage', storage);
    return { groups: TestBed.inject(CollapsedGroups), storage };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('starts with everything open', () => {
    expect(make().groups.isOpen('space:s1')).toBe(true);
  });

  it('remembers collapsed ids in localStorage', () => {
    const { groups, storage } = make();
    groups.setOpen('space:s1', false);
    expect(groups.isOpen('space:s1')).toBe(false);
    expect(JSON.parse(storage.getItem(COLLAPSED_KEY)!)).toEqual(['space:s1']);
    groups.setOpen('space:s1', true);
    expect(JSON.parse(storage.getItem(COLLAPSED_KEY)!)).toEqual([]);
  });

  it('restores what was stored and ignores garbage', () => {
    expect(make('["tab:t1"]').groups.isOpen('tab:t1')).toBe(false);
    TestBed.resetTestingModule();
    expect(make('not json').groups.isOpen('tab:t1')).toBe(true);
    TestBed.resetTestingModule();
    expect(make('{"a":1}').groups.isOpen('a')).toBe(true);
    TestBed.resetTestingModule();
    expect(make('[1,"x"]').groups.isOpen('x')).toBe(false);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    const groups = TestBed.inject(CollapsedGroups);
    groups.setOpen('a', false);
    expect(groups.isOpen('a')).toBe(false);
  });

  describe('noteBlocked', () => {
    it('opens a group the moment it becomes blocked', () => {
      const { groups } = make('["space:s1","tab:t1","space:s2"]');
      groups.noteBlocked([]);
      groups.noteBlocked(['space:s1', 'tab:t1']);
      expect(groups.isOpen('space:s1')).toBe(true);
      expect(groups.isOpen('tab:t1')).toBe(true);
      expect(groups.isOpen('space:s2')).toBe(false);
    });

    it('does not fight the user while the group stays blocked', () => {
      const { groups } = make();
      groups.noteBlocked(['space:s1']);
      groups.setOpen('space:s1', false);
      groups.noteBlocked(['space:s1']);
      expect(groups.isOpen('space:s1')).toBe(false);
    });

    it('opens again when it is blocked anew, and never closes anything', () => {
      const { groups } = make();
      groups.noteBlocked(['space:s1']);
      groups.noteBlocked([]);
      expect(groups.isOpen('space:s1')).toBe(true);
      groups.setOpen('space:s1', false);
      groups.noteBlocked(['space:s1']);
      expect(groups.isOpen('space:s1')).toBe(true);
    });

    it('opens a group that is already blocked on first sight', () => {
      const { groups } = make('["space:s1"]');
      groups.noteBlocked(['space:s1']);
      expect(groups.isOpen('space:s1')).toBe(true);
    });
  });
});
