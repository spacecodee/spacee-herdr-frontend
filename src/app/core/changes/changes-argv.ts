import { isSafePath } from '../folders/folder-path';

export type Scope = 'unstaged' | 'staged' | 'commit';

/** Rows of one diff shown; the rest is cut off and the person is told. */
export const MAX_DIFF_ROWS = 2000;
/** Seconds core gives one git call. */
export const GIT_TIMEOUT_S = 10;

function folder(dir: string): string {
  if (!dir.startsWith('/') || !isSafePath(dir)) throw new Error('That is not a valid folder path.');
  return dir;
}

/** A path inside the repository: one argv element after `--`, so spaces, quotes and `$()` stay data. */
function file(path: string): string {
  if (!isSafePath(path)) throw new Error('That is not a valid file path.');
  return path;
}

const git = (dir: string, ...args: string[]): string[] => ['git', '-C', folder(dir), ...args];

export const repoArgv = (dir: string): string[] => git(dir, 'rev-parse', '--show-toplevel');
export const branchArgv = (dir: string): string[] => git(dir, 'branch', '--show-current');
/** Everything that differs from HEAD, staged or not; the header chip counts this. */
export const summaryArgv = (dir: string): string[] => git(dir, 'diff', 'HEAD', '--numstat', '-z');
export const untrackedArgv = (dir: string): string[] => git(dir, 'ls-files', '--others', '--exclude-standard', '-z');

/** The part of a scope's command that comes after `git -C <dir>`, up to its options. */
function scoped(scope: Scope, ...options: string[]): string[] {
  switch (scope) {
    case 'unstaged':
      return ['diff', ...options];
    case 'staged':
      return ['diff', '--cached', ...options];
    case 'commit':
      return ['show', ...options, '--format=', 'HEAD'];
  }
}

export const numstatArgv = (dir: string, scope: Scope): string[] => git(dir, ...scoped(scope, '--numstat', '-z'));
export const nameStatusArgv = (dir: string, scope: Scope): string[] => git(dir, ...scoped(scope, '--name-status', '-z'));
export const diffArgv = (dir: string, scope: Scope, path: string): string[] =>
  git(dir, ...scoped(scope, '--no-color'), '--', file(path));

/**
 * Counts the lines of every untracked file with `wc -l`. A constant script: the folder arrives as
 * `$1`, never inside the script text.
 */
const COUNT_SCRIPT = 'cd "$1" && git ls-files --others --exclude-standard -z | xargs -0 wc -l';
export const untrackedCountArgv = (dir: string): string[] => ['sh', '-c', COUNT_SCRIPT, 'sh', folder(dir)];
