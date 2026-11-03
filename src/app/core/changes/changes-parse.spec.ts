import { addedRows, parseDiff, parseNameStatus, parseNumstat, sumFiles } from './changes-parse';

describe('parseNumstat (-z)', () => {
  it('reads counts and paths, with spaces, quotes and shell characters untouched', () => {
    const out = '18\t3\tsrc/a b.ts\0' + '1\t0\tweird "q" $(x); y.ts\0' + '0\t4\tgone.ts\0';
    expect(parseNumstat(out)).toEqual([
      { path: 'src/a b.ts', added: 18, deleted: 3, binary: false },
      { path: 'weird "q" $(x); y.ts', added: 1, deleted: 0, binary: false },
      { path: 'gone.ts', added: 0, deleted: 4, binary: false },
    ]);
  });

  it('marks binary files (- -)', () => {
    expect(parseNumstat('-\t-\tlogo.png\0')).toEqual([{ path: 'logo.png', added: 0, deleted: 0, binary: true }]);
  });

  it('reads a rename as its new path and remembers the old one', () => {
    expect(parseNumstat('2\t1\t\0old name.ts\0new name.ts\0')).toEqual([
      { path: 'new name.ts', from: 'old name.ts', added: 2, deleted: 1, binary: false },
    ]);
  });

  it('is empty for no output', () => {
    expect(parseNumstat('')).toEqual([]);
  });
});

describe('parseNameStatus (-z)', () => {
  it('maps paths to the status letter', () => {
    const out = 'M\0src/a b.ts\0A\0new.ts\0D\0old.ts\0R100\0from.ts\0to.ts\0';
    expect([...parseNameStatus(out)]).toEqual([
      ['src/a b.ts', 'M'],
      ['new.ts', 'A'],
      ['old.ts', 'D'],
      ['to.ts', 'R'],
    ]);
  });

  it('turns an unknown letter into M', () => {
    expect(parseNameStatus('T\0x\0').get('x')).toBe('M');
  });
});

describe('sumFiles', () => {
  it('adds lines and counts files', () => {
    expect(
      sumFiles([
        { path: 'a', added: 2, deleted: 1, binary: false },
        { path: 'b', added: 3, deleted: 0, binary: true },
      ]),
    ).toEqual({ files: 2, added: 5, deleted: 1 });
  });
});

describe('parseDiff', () => {
  const diff = [
    'diff --git a/a.ts b/a.ts',
    'index 111..222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -12,3 +12,4 @@ export class X {',
    '   keep',
    '-  gone',
    '+  new one',
    '+  new two',
    ' tail',
    '\\ No newline at end of file',
    '@@ -40,2 +41,2 @@',
    ' c',
    '-d',
    '+e',
    '',
  ].join('\n');

  it('numbers old and new lines per hunk and keeps hunk headers as separators', () => {
    const { rows, truncated } = parseDiff(diff);
    expect(truncated).toBe(false);
    expect(rows).toEqual([
      { kind: 'hunk', text: '@@ -12,3 +12,4 @@ export class X {' },
      { kind: 'ctx', old: 12, new: 12, text: '  keep' },
      { kind: 'del', old: 13, text: '  gone' },
      { kind: 'add', new: 13, text: '  new one' },
      { kind: 'add', new: 14, text: '  new two' },
      { kind: 'ctx', old: 14, new: 15, text: 'tail' },
      { kind: 'hunk', text: '@@ -40,2 +41,2 @@' },
      { kind: 'ctx', old: 40, new: 41, text: 'c' },
      { kind: 'del', old: 41, text: 'd' },
      { kind: 'add', new: 42, text: 'e' },
    ]);
  });

  it('shows the first 2,000 rows and says it was cut', () => {
    const lines = ['@@ -1,3000 +1,3000 @@', ...Array.from({ length: 3000 }, (_, i) => ` line ${i}`)];
    const { rows, truncated } = parseDiff(lines.join('\n'));
    expect(rows).toHaveLength(2000);
    expect(truncated).toBe(true);
  });

  it('is empty when there are no hunks', () => {
    expect(parseDiff('')).toEqual({ rows: [], truncated: false });
    expect(parseDiff('diff --git a/x b/x\nBinary files a/x and b/x differ\n').rows).toEqual([]);
  });
});

describe('addedRows', () => {
  it('shows a whole new file as added rows without a hunk header', () => {
    expect(addedRows('a\nb\n')).toEqual({
      rows: [
        { kind: 'add', new: 1, text: 'a' },
        { kind: 'add', new: 2, text: 'b' },
      ],
      truncated: false,
    });
  });

  it('keeps a last line without a newline and an empty line in the middle', () => {
    expect(addedRows('a\n\nb').rows.map((r) => (r as { text: string }).text)).toEqual(['a', '', 'b']);
  });

  it('is empty for an empty file and cuts at 2,000 rows', () => {
    expect(addedRows('')).toEqual({ rows: [], truncated: false });
    const big = addedRows('x\n'.repeat(2500));
    expect(big.rows).toHaveLength(2000);
    expect(big.truncated).toBe(true);
  });
});
