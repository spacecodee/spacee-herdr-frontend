/** Longest path the picker accepts; the bridge refuses more than this too. */
export const MAX_PATH = 4096;

/** A path is user input that ends up as one argv element: no NUL, no newline, no control characters. */
export function isSafePath(path: string): boolean {
  // eslint-disable-next-line no-control-regex
  return path !== '' && path.length <= MAX_PATH && !/[\u0000-\u001f\u007f]/.test(path);
}

/** Collapses `//`, `.` and `..` without touching the disk. Returns `/` for the root. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

/**
 * What the person typed as an absolute path: `~` and `~/x` start at `home`, `/x` is absolute.
 * Null for anything else (`~other`, relative, unsafe), so nothing odd reaches the machine.
 */
export function resolveTyped(input: string, home: string): string | null {
  const text = input.trim();
  let absolute: string;
  if (text === '~') absolute = home;
  else if (text.startsWith('~/')) absolute = `${home}/${text.slice(2)}`;
  else if (text.startsWith('/')) absolute = text;
  else return null;
  if (!isSafePath(absolute)) return null;
  return normalizePath(absolute);
}

/** True when the filter text is a path to go to, not letters to filter by. */
export const looksLikePath = (text: string): boolean => /^\s*[/~]/.test(text);

export const parentOf = (path: string): string => normalizePath(`${path}/..`);

export const joinPath = (dir: string, name: string): string => normalizePath(`${dir}/${name}`);

export interface Crumb {
  label: string;
  path: string;
}

/** Tappable segments from `~` (inside home) or `/` down to `path`. */
export function crumbs(path: string, home: string): Crumb[] {
  const target = normalizePath(path);
  const root = normalizePath(home);
  const inHome = target === root || target.startsWith(root === '/' ? '/' : `${root}/`);
  const base = inHome ? root : '/';
  const out: Crumb[] = [{ label: inHome ? '~' : '/', path: base }];
  const rest = target.slice(base === '/' ? 1 : base.length + 1);
  let current = base;
  for (const part of rest.split('/')) {
    if (part === '') continue;
    current = joinPath(current, part);
    out.push({ label: part, path: current });
  }
  return out;
}

/** `~/code/app` for a path inside home, the path as it is otherwise. */
export function tildePath(path: string, home: string): string {
  const root = normalizePath(home);
  if (path === root) return '~';
  return root !== '/' && path.startsWith(`${root}/`) ? `~${path.slice(root.length)}` : path;
}

/** Keeps the first and last parts of a long path: `~/Dev…/spacee-herdr`. */
export function middleTruncate(text: string, max = 34): string {
  if (text.length <= max) return text;
  const tail = Math.ceil((max - 1) * 0.55);
  const head = max - 1 - tail;
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}
