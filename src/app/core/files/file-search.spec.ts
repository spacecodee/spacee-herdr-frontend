import { findMatches, segmentLine } from './file-search';
import type { Token } from './highlight';

describe('findMatches', () => {
  const lines = ['const size = 1;', '// Terminal text size', 'SIZES = [12]'];

  it('finds every match, ignoring case, in reading order', () => {
    expect(findMatches(lines, 'size')).toEqual([
      { line: 0, start: 6, end: 10 },
      { line: 1, start: 17, end: 21 },
      { line: 2, start: 0, end: 4 },
    ]);
  });

  it('finds nothing for an empty query', () => {
    expect(findMatches(lines, '')).toEqual([]);
  });

  it('takes the query literally, not as a pattern', () => {
    expect(findMatches(['a.b', 'axb'], '.')).toEqual([{ line: 0, start: 1, end: 2 }]);
    expect(findMatches(['(x)'], '(')).toEqual([{ line: 0, start: 0, end: 1 }]);
  });

  it('finds several on one line without overlapping', () => {
    expect(findMatches(['aaaa'], 'aa')).toEqual([
      { line: 0, start: 0, end: 2 },
      { line: 0, start: 2, end: 4 },
    ]);
  });
});

describe('segmentLine', () => {
  const tokens: Token[] = [
    { kind: 'keyword', text: 'const' },
    { kind: 'plain', text: ' size = ' },
    { kind: 'string', text: "'size'" },
  ];

  it('is the tokens when nothing matches', () => {
    expect(segmentLine(tokens, [])).toEqual(tokens.map((t) => ({ ...t, hit: null })));
  });

  it('cuts tokens at match edges and tells the current match from the others', () => {
    expect(
      segmentLine(tokens, [
        { start: 6, end: 10, current: false },
        { start: 14, end: 18, current: true },
      ]),
    ).toEqual([
      { kind: 'keyword', text: 'const', hit: null },
      { kind: 'plain', text: ' ', hit: null },
      { kind: 'plain', text: 'size', hit: 'hit' },
      { kind: 'plain', text: ' = ', hit: null },
      { kind: 'string', text: "'", hit: null },
      { kind: 'string', text: 'size', hit: 'current' },
      { kind: 'string', text: "'", hit: null },
    ]);
  });

  it('keeps a match that spans two tokens in both', () => {
    const out = segmentLine(tokens, [{ start: 3, end: 8, current: false }]);
    expect(out.map((s) => s.text).join('')).toBe("const size = 'size'");
    expect(out.filter((s) => s.hit).map((s) => s.text)).toEqual(['st', ' si']);
  });
});
