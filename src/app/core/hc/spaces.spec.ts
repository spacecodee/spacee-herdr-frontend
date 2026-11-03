import { arrangeSpaces, locate, parseSpaces, tabNameOf } from './spaces';
import type { Terminal } from './types';

const block = (terminal: string) => ({ type: 'block', id: `p${terminal}`, content: { terminal } });
const doc = (spaces: unknown) => ({ value: { spaces }, version: 3 });

const term = (address: string): Terminal => ({
  address,
  labels: {},
  argv: ['sh'],
  cwd: '/',
  state: 'live',
  created_ms: 1,
  screen: 'exact',
  cols: 80,
  rows: 24,
});

describe('parseSpaces', () => {
  it('reads spaces, tabs and every terminal in the tree, in order', () => {
    const result = parseSpaces(
      doc([
        {
          id: 's1',
          name: 'Work',
          folder: '',
          tabs: [
            {
              id: 'tb1',
              name: 'Claude',
              root: {
                type: 'row',
                children: [
                  block('t1'),
                  { type: 'col', children: [block('t2'), { type: 'future', children: [block('t3')] }] },
                ],
              },
            },
            { id: 'tb2', name: 'NVim', root: block('t4') },
          ],
        },
      ]),
    );
    expect(result).toEqual([
      {
        id: 's1',
        name: 'Work',
        tabs: [
          {
            id: 'tb1',
            name: 'Claude',
            addresses: ['t1', 't2', 't3'],
            panes: [
              { id: 'pt1', address: 't1' },
              { id: 'pt2', address: 't2' },
              { id: 'pt3', address: 't3' },
            ],
          },
          { id: 'tb2', name: 'NVim', addresses: ['t4'], panes: [{ id: 'pt4', address: 't4' }] },
        ],
      },
    ]);
  });

  it('returns [] for a missing document or garbage', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { value: null, version: 0 }, { value: { spaces: 'no' } }]) {
      expect(parseSpaces(bad)).toEqual([]);
    }
  });

  it('keeps what is valid and drops what is not, never throwing', () => {
    const result = parseSpaces(
      doc([
        null,
        { id: 5, name: 'bad id', tabs: [] },
        { id: 's1', tabs: [null, { name: 'no id', root: block('t1') }, { id: 'tb', name: 7, root: { children: 'x' } }] },
      ]),
    );
    expect(result).toEqual([
      {
        id: 's1',
        name: '',
        tabs: [{ id: 'tb', name: '', addresses: [], panes: [] }],
      },
    ]);
  });

  it('ignores blocks without a terminal string and deduplicates addresses', () => {
    const [space] = parseSpaces(
      doc([
        {
          id: 's',
          name: 'S',
          tabs: [
            {
              id: 'tb',
              name: 'T',
              root: { children: [block('t1'), { type: 'block', content: {} }, { type: 'block' }, block('t1')] },
            },
          ],
        },
      ]),
    );
    expect(space.tabs[0].addresses).toEqual(['t1']);
    expect(space.tabs[0].panes).toEqual([{ id: 'pt1', address: 't1' }]);
  });

  it('keeps a terminal whose leaf has no id out of the panes', () => {
    const [space] = parseSpaces(
      doc([{ id: 's', name: 'S', tabs: [{ id: 'tb', name: 'T', root: { content: { terminal: 't1' } } }] }]),
    );
    expect(space.tabs[0].addresses).toEqual(['t1']);
    expect(space.tabs[0].panes).toEqual([]);
  });
});

describe('arrangeSpaces', () => {
  const spaces = parseSpaces(
    doc([
      {
        id: 's1',
        name: 'A',
        tabs: [
          { id: 'a1', name: 'one', root: { children: [block('t2'), block('t1')] } },
          { id: 'a2', name: 'empty', root: { children: [block('gone')] } },
        ],
      },
      { id: 's2', name: 'B', tabs: [{ id: 'b1', name: 'x', root: { children: [block('t9')] } }] },
    ]),
  );

  it('keeps desktop order, hides empty tabs and spaces, and returns the rest', () => {
    const live = [term('t1'), term('t2'), term('t3'), term('rohan/t7')];
    const { spaces: arranged, other } = arrangeSpaces(spaces, live);
    expect(arranged.map((s) => [s.name, s.tabs.map((t) => [t.name, t.terminals.map((x) => x.address)])])).toEqual([
      ['A', [['one', ['t2', 't1']]]],
    ]);
    expect(other.map((t) => t.address)).toEqual(['t3', 'rohan/t7']);
  });

  it('names a tab without a name by its position', () => {
    const unnamed = parseSpaces(doc([{ id: 's', name: 'S', tabs: [{ id: 'x', name: '', root: block('t1') }] }]));
    expect(arrangeSpaces(unnamed, [term('t1')]).spaces[0].tabs[0].name).toBe('Tab 1');
  });
});

describe('tabNameOf', () => {
  const spaces = [
    {
      id: 's',
      name: 'S',
      tabs: [
        { id: 'a', name: 'Implementer - F', addresses: ['t1', 't2'], panes: [] },
        { id: 'b', name: '', addresses: ['t3'], panes: [] },
      ],
    },
  ];
  it('names the tab that holds the terminal, as the home list does', () => {
    expect(tabNameOf(spaces, 't2')).toBe('Implementer - F');
    expect(tabNameOf(spaces, 't3')).toBe('Tab 2');
  });
  it('is empty when no tab holds it', () => {
    expect(tabNameOf(spaces, 'zz')).toBe('');
    expect(tabNameOf([], 't1')).toBe('');
  });
});

describe('locate', () => {
  const spaces = parseSpaces(
    doc([
      { id: 's1', name: 'A', tabs: [{ id: 'a1', name: 'one', root: block('t1') }] },
      {
        id: 's2',
        name: 'B',
        tabs: [
          { id: 'b1', name: 'x', root: block('t2') },
          { id: 'b2', name: '', root: { children: [block('t3'), block('t4')] } },
        ],
      },
    ]),
  );

  it('gives ids, 1-based positions and counts', () => {
    expect(locate(spaces, 't4')).toEqual({
      spaceId: 's2',
      spaceName: 'B',
      spaceIndex: 2,
      spaceCount: 2,
      tabId: 'b2',
      tabName: 'Tab 2',
      tabIndex: 2,
      tabCount: 2,
      paneId: 'pt4',
      paneCount: 2,
    });
  });

  it('is null for a terminal in no tab', () => {
    expect(locate(spaces, 'zz')).toBeNull();
  });
});
