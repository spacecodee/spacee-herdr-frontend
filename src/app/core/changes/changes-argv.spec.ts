import {
  MAX_DIFF_ROWS,
  branchArgv,
  diffArgv,
  nameStatusArgv,
  numstatArgv,
  repoArgv,
  summaryArgv,
  untrackedArgv,
  untrackedCountArgv,
} from './changes-argv';

describe('changes argv', () => {
  const dir = '/home/me/my proj/a "b" $(x); y';

  it('keeps the folder as one argv element, never in a shell line', () => {
    expect(repoArgv(dir)).toEqual(['git', '-C', dir, 'rev-parse', '--show-toplevel']);
    expect(branchArgv(dir)).toEqual(['git', '-C', dir, 'branch', '--show-current']);
    expect(untrackedArgv(dir)).toEqual(['git', '-C', dir, 'ls-files', '--others', '--exclude-standard', '-z']);
    for (const argv of [repoArgv(dir), branchArgv(dir), numstatArgv(dir, 'unstaged'), summaryArgv(dir)]) {
      expect(argv.filter((a) => a === dir)).toHaveLength(1);
    }
  });

  it('builds the three scopes', () => {
    expect(numstatArgv(dir, 'unstaged')).toEqual(['git', '-C', dir, 'diff', '--numstat', '-z']);
    expect(numstatArgv(dir, 'staged')).toEqual(['git', '-C', dir, 'diff', '--cached', '--numstat', '-z']);
    expect(numstatArgv(dir, 'commit')).toEqual(['git', '-C', dir, 'show', '--numstat', '-z', '--format=', 'HEAD']);
    expect(nameStatusArgv(dir, 'staged')).toEqual(['git', '-C', dir, 'diff', '--cached', '--name-status', '-z']);
    expect(nameStatusArgv(dir, 'commit')).toEqual(['git', '-C', dir, 'show', '--name-status', '-z', '--format=', 'HEAD']);
  });

  it('passes a file as its own element after --', () => {
    const file = 'src/a b/"q" $(rm -rf x); y.ts';
    expect(diffArgv(dir, 'unstaged', file)).toEqual(['git', '-C', dir, 'diff', '--no-color', '--', file]);
    expect(diffArgv(dir, 'staged', file)).toEqual(['git', '-C', dir, 'diff', '--cached', '--no-color', '--', file]);
    expect(diffArgv(dir, 'commit', file)).toEqual(['git', '-C', dir, 'show', '--no-color', '--format=', 'HEAD', '--', file]);
    expect(diffArgv(dir, 'unstaged', '-weird.ts').slice(-2)).toEqual(['--', '-weird.ts']);
  });

  it('rejects paths with NUL or newline, and a relative folder', () => {
    expect(() => diffArgv(dir, 'unstaged', 'a\nb')).toThrow();
    expect(() => diffArgv(dir, 'unstaged', 'a\0b')).toThrow();
    expect(() => repoArgv('relative/dir')).toThrow();
    expect(() => repoArgv('/a\nb')).toThrow();
  });

  it('counts untracked lines with a constant script that gets the folder as $1', () => {
    const argv = untrackedCountArgv(dir);
    expect(argv.slice(0, 2)).toEqual(['sh', '-c']);
    expect(argv[2]).not.toContain(dir);
    expect(argv.slice(3)).toEqual(['sh', dir]);
  });

  it('summarizes against HEAD', () => {
    expect(summaryArgv(dir)).toEqual(['git', '-C', dir, 'diff', 'HEAD', '--numstat', '-z']);
  });

  it('caps the diff', () => {
    expect(MAX_DIFF_ROWS).toBe(2000);
  });
});
