import { normalizePath } from '../folders/folder-path';

/** `src/app/a.ts` as the name `a.ts` and its folder `src/app/`, for the two lines of a row. */
export function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf('/');
  return { name: path.slice(slash + 1), dir: path.slice(0, slash + 1) };
}

export const fileCount = (n: number): string => (n === 1 ? '1 file' : `${n} files`);
export const changedText = (n: number): string => `${fileCount(n)} changed`;
export const linesText = (n: number, language: string): string => `${n === 1 ? '1 line' : `${n} lines`} · ${language}`;

/** The folders above a file, relative to the project folder when it is inside it, else from the root (`/`). */
export function crumbsOf(path: string, folder: string): string[] {
  const abs = normalizePath(path);
  const base = normalizePath(folder || '/');
  const dirs = abs.split('/').filter(Boolean).slice(0, -1);
  if (base === '/') return dirs;
  if (abs.startsWith(`${base}/`)) return dirs.slice(base.split('/').filter(Boolean).length);
  return ['/', ...dirs];
}
