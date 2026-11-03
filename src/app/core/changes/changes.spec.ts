import { TestBed } from '@angular/core/testing';
import { HcClient } from '../hc/hc-client';
import { Changes } from './changes';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const ok = (stdout = '') => ({ code: 0, stdout: b64(stdout), stderr: b64(''), truncated: false, timed_out: false });
const fail = (code = 128) => ({ code, stdout: b64(''), stderr: b64('fatal'), truncated: false, timed_out: false });

type Argv = string[];
const has = (argv: Argv, ...words: string[]) => words.every((w) => argv.includes(w));

describe('Changes', () => {
  let call: ReturnType<typeof vi.fn>;
  let changes: Changes;
  let handler: (argv: Argv) => ReturnType<typeof ok>;
  const top = '/home/me/my proj';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    call = vi.fn((_m: string, p: { argv: Argv }) => Promise.resolve(handler(p.argv)));
    TestBed.configureTestingModule({ providers: [{ provide: HcClient, useValue: { call } }] });
    changes = TestBed.inject(Changes);
  });
  afterEach(() => vi.useRealTimers());

  /** A repo at `top` with one modified, one staged and one untracked file. */
  function repo(extra: (argv: Argv) => ReturnType<typeof ok> | null = () => null) {
    handler = (argv) => {
      const special = extra(argv);
      if (special) return special;
      if (has(argv, 'rev-parse')) return ok(`${top}\n`);
      if (has(argv, 'branch')) return ok('feat/x\n');
      if (has(argv, 'ls-files')) return ok('new file.ts\0');
      if (argv[0] === 'sh') return ok('   5 new file.ts\n   5 total\n');
      if (has(argv, '--numstat') && has(argv, 'HEAD') && argv[3] === 'diff') return ok('3\t1\ta.ts\0-\t-\tlogo.png\0');
      if (has(argv, '--numstat', '--cached')) return ok('2\t0\tstaged.ts\0');
      if (has(argv, '--numstat') && argv[3] === 'diff') return ok('3\t1\ta.ts\0-\t-\tlogo.png\0');
      if (has(argv, '--numstat')) return ok('7\t2\tlast one.ts\0');
      if (has(argv, '--name-status', '--cached')) return ok('A\0staged.ts\0');
      if (has(argv, '--name-status') && argv[3] === 'diff') return ok('M\0a.ts\0M\0logo.png\0');
      if (has(argv, '--name-status')) return ok('D\0last one.ts\0');
      return fail();
    };
  }

  it('finds the repository top and the branch', async () => {
    repo();
    expect(await changes.repo('rohan', '/home/me/my proj/sub')).toEqual({ top, branch: 'feat/x' });
    expect(call.mock.calls[0][1].on).toBe('rohan');
  });

  it('is not a repository when git says so', async () => {
    handler = () => fail();
    expect(await changes.repo('', '/tmp')).toBeNull();
    expect(await changes.summary('', '/tmp')).toBeNull();
  });

  it('lists unstaged files with status, counts and the untracked ones as added', async () => {
    repo();
    const list = await changes.list('', top, 'unstaged');
    expect(list.files).toEqual([
      { path: 'a.ts', added: 3, deleted: 1, binary: false, status: 'M', untracked: false },
      { path: 'logo.png', added: 0, deleted: 0, binary: true, status: 'M', untracked: false },
      { path: 'new file.ts', added: 5, deleted: 0, binary: false, status: 'A', untracked: true },
    ]);
    expect(list.total).toEqual({ files: 3, added: 8, deleted: 1 });
  });

  it('lists staged and last-commit files without untracked ones', async () => {
    repo();
    expect((await changes.list('', top, 'staged')).files.map((f) => [f.path, f.status])).toEqual([['staged.ts', 'A']]);
    expect((await changes.list('', top, 'commit')).files.map((f) => [f.path, f.status])).toEqual([['last one.ts', 'D']]);
  });

  it('summarizes the working tree against HEAD, untracked included', async () => {
    repo();
    expect(await changes.summary('', top)).toEqual({ files: 3, added: 8, deleted: 1 });
  });

  it('falls back to the staged changes before the first commit', async () => {
    repo((argv) => (has(argv, 'HEAD') ? fail() : null));
    expect(await changes.summary('', top)).toEqual({ files: 2, added: 7, deleted: 0 });
  });

  it('runs at most once per 15 s, and once more at the end of the window', async () => {
    repo();
    await changes.refresh('', top);
    const first = call.mock.calls.length;
    const again = changes.refresh('', top);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(call.mock.calls.length).toBe(first);
    await vi.advanceTimersByTimeAsync(1_500);
    await again;
    expect(call.mock.calls.length).toBeGreaterThan(first);
    expect(changes.summaryOf('', top)()).toEqual({ files: 3, added: 8, deleted: 1 });
  });

  it('hides the chip for a clean repo and for a folder that is not one', async () => {
    repo((argv) => (argv[0] === 'sh' || has(argv, '--numstat') || has(argv, 'ls-files') ? ok('') : null));
    await changes.refresh('', top);
    expect(changes.summaryOf('', top)()).toBeNull();
  });

  it('parses a file diff, with the path as one element after --', async () => {
    const file = 'src/a b "q" $(x); y.ts';
    repo((argv) => (has(argv, '--no-color') ? ok('@@ -1,1 +1,1 @@\n-a\n+b\n') : null));
    const diff = await changes.diff('', top, 'unstaged', file);
    expect(diff.rows.map((r) => r.kind)).toEqual(['hunk', 'del', 'add']);
    const argv: Argv = call.mock.calls.at(-1)![1].argv;
    expect(argv.slice(-2)).toEqual(['--', file]);
  });
});
