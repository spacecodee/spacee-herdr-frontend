import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_COMMANDS,
  MAX_TEXT,
  MAX_TITLE,
  PROMPTS_KEY,
  Prompts,
  promptProblem,
} from './prompts';

function fakeStorage(initial?: string): Storage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PROMPTS_KEY, initial);
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

describe('Prompts', () => {
  let storage: Storage;

  function create(initial?: string): Prompts {
    storage = fakeStorage(initial);
    vi.stubGlobal('localStorage', storage);
    TestBed.resetTestingModule();
    return TestBed.inject(Prompts);
  }
  const stored = () => JSON.parse(storage.getItem(PROMPTS_KEY)!);

  afterEach(() => vi.unstubAllGlobals());

  it('starts with no prompts and the four default command chips', () => {
    const prompts = create();
    expect(prompts.prompts()).toEqual([]);
    expect(prompts.commands().map((c) => c.text)).toEqual(['/clear', '/compact', '/init', '/review']);
    expect(prompts.commands().every((c) => !c.sendNow && c.title === c.text)).toBe(true);
    expect(DEFAULT_COMMANDS).toHaveLength(4);
  });

  it('keeps prompts in creation order and writes a versioned document to spacee-herdr.prompts', () => {
    const prompts = create();
    expect(PROMPTS_KEY).toBe('spacee-herdr.prompts');
    prompts.add('prompts', { title: 'B', text: 'second?', sendNow: false });
    prompts.add('prompts', { title: 'A', text: 'first?', sendNow: true });
    expect(prompts.prompts().map((p) => p.title)).toEqual(['B', 'A']);
    const doc = stored();
    expect(doc.version).toBe(1);
    expect(doc.prompts.map((p: { title: string }) => p.title)).toEqual(['B', 'A']);
    expect(doc.prompts[1]).toMatchObject({ title: 'A', text: 'first?', sendNow: true });
    expect(typeof doc.prompts[0].id).toBe('string');
  });

  it('reloads what was saved, in the same order', () => {
    const first = create();
    first.add('prompts', { title: 'One', text: 'a', sendNow: false });
    first.add('prompts', { title: 'Two', text: 'b', sendNow: true });
    const doc = storage.getItem(PROMPTS_KEY)!;
    const second = create(doc);
    expect(second.prompts().map((p) => p.title)).toEqual(['One', 'Two']);
    expect(second.prompts()[1].sendNow).toBe(true);
  });

  it.each([
    ['not JSON', '{nope'],
    ['not an object', '"hello"'],
    ['null', 'null'],
    ['an unknown version', JSON.stringify({ version: 9, prompts: [{ id: 'x', title: 't', text: 't', sendNow: false }], commands: [] })],
    ['no version', JSON.stringify({ prompts: [] })],
  ])('reads %s as the defaults', (_name, raw) => {
    const prompts = create(raw);
    expect(prompts.prompts()).toEqual([]);
    expect(prompts.commands()).toEqual(DEFAULT_COMMANDS);
  });

  it('drops entries that are malformed or break the limits, and keeps the rest', () => {
    const good = { id: 'g', title: 'Good', text: 'text', sendNow: false };
    const prompts = create(
      JSON.stringify({
        version: 1,
        prompts: [
          good,
          { id: 'a', title: '', text: 'x', sendNow: false },
          { id: 'b', title: 'x', text: '  ', sendNow: false },
          { id: 'c', title: 'x'.repeat(MAX_TITLE + 1), text: 'x', sendNow: false },
          { id: 'd', title: 'x', text: 'x'.repeat(MAX_TEXT + 1), sendNow: false },
          { id: 'e', title: 'x', text: 'x', sendNow: 'yes' },
          { title: 'no id', text: 'x', sendNow: false },
          'junk',
          null,
          { ...good },
        ],
        commands: [{ id: 'k', title: '/x', text: '/x', sendNow: false }],
      }),
    );
    expect(prompts.prompts()).toEqual([good]);
    expect(prompts.commands()).toEqual([{ id: 'k', title: '/x', text: '/x', sendNow: false }]);
  });

  it('keeps an emptied chip row empty instead of bringing the defaults back', () => {
    const prompts = create();
    for (const c of prompts.commands()) prompts.remove(c.id);
    expect(prompts.commands()).toEqual([]);
    expect(create(storage.getItem(PROMPTS_KEY)!).commands()).toEqual([]);
  });

  it('accepts the limits exactly and refuses one past them', () => {
    expect(promptProblem({ title: 'x'.repeat(MAX_TITLE), text: 'x'.repeat(MAX_TEXT), sendNow: false })).toBeNull();
    expect(promptProblem({ title: 'x'.repeat(MAX_TITLE + 1), text: 'x', sendNow: false })).not.toBeNull();
    expect(promptProblem({ title: 'x', text: 'x'.repeat(MAX_TEXT + 1), sendNow: false })).not.toBeNull();
    expect(promptProblem({ title: '  ', text: 'x', sendNow: false })).not.toBeNull();
    expect(promptProblem({ title: 'x', text: '\n ', sendNow: false })).not.toBeNull();
  });

  it('add refuses an invalid prompt and changes nothing', () => {
    const prompts = create();
    expect(prompts.add('prompts', { title: '', text: 'x', sendNow: false })).toBeNull();
    expect(prompts.add('prompts', { title: 'x', text: 'y'.repeat(MAX_TEXT + 1), sendNow: false })).toBeNull();
    expect(prompts.prompts()).toEqual([]);
    expect(storage.getItem(PROMPTS_KEY)).toBeNull();
  });

  it('trims the title, keeps the text as typed', () => {
    const prompts = create();
    prompts.add('prompts', { title: '  Review  ', text: 'line one\nline two\n', sendNow: false });
    expect(prompts.prompts()[0]).toMatchObject({ title: 'Review', text: 'line one\nline two\n' });
  });

  it('update edits in place without moving the entry, in either list', () => {
    const prompts = create();
    prompts.add('prompts', { title: 'A', text: 'a', sendNow: false });
    const b = prompts.add('prompts', { title: 'B', text: 'b', sendNow: false })!;
    prompts.add('prompts', { title: 'C', text: 'c', sendNow: false });
    expect(prompts.update(b.id, { title: 'B2', text: 'b2', sendNow: true })).toBe(true);
    expect(prompts.prompts().map((p) => [p.title, p.text, p.sendNow])).toEqual([
      ['A', 'a', false],
      ['B2', 'b2', true],
      ['C', 'c', false],
    ]);
    const clear = prompts.commands()[0];
    prompts.update(clear.id, { title: '/clear', text: '/clear all', sendNow: true });
    expect(prompts.commands()[0]).toMatchObject({ id: clear.id, text: '/clear all', sendNow: true });
    expect(stored().commands[0].text).toBe('/clear all');
  });

  it('update refuses invalid input and unknown ids', () => {
    const prompts = create();
    const a = prompts.add('prompts', { title: 'A', text: 'a', sendNow: false })!;
    expect(prompts.update(a.id, { title: '', text: 'a', sendNow: false })).toBe(false);
    expect(prompts.update('nope', { title: 'x', text: 'x', sendNow: false })).toBe(false);
    expect(prompts.prompts()[0].title).toBe('A');
  });

  it('remove deletes from either list and persists', () => {
    const prompts = create();
    const a = prompts.add('prompts', { title: 'A', text: 'a', sendNow: false })!;
    prompts.remove(a.id);
    prompts.remove(prompts.commands()[1].id);
    expect(prompts.prompts()).toEqual([]);
    expect(prompts.commands().map((c) => c.text)).toEqual(['/clear', '/init', '/review']);
    expect(stored().commands).toHaveLength(3);
  });

  it('a chip can be added to the command row', () => {
    const prompts = create();
    prompts.add('commands', { title: '/cost', text: '/cost', sendNow: true });
    expect(prompts.commands().at(-1)).toMatchObject({ text: '/cost', sendNow: true });
  });

  it('keeps working for the session when storage throws', () => {
    storage = fakeStorage();
    storage.setItem = () => {
      throw new Error('quota');
    };
    vi.stubGlobal('localStorage', storage);
    TestBed.resetTestingModule();
    const prompts = TestBed.inject(Prompts);
    prompts.add('prompts', { title: 'A', text: 'a', sendNow: false });
    expect(prompts.prompts()).toHaveLength(1);
  });
});
