import { isSafePath, joinPath } from './folder-path';

/** A failure with a sentence for the person; the picker shows it as is. */
export class FolderError extends Error {}

/** `find` and `test` read a first argument starting with `-` as an expression, so only absolute paths get in. */
function absolute(path: string): string {
  if (!path.startsWith('/') || !isSafePath(path)) throw new FolderError('That is not a valid folder path.');
  return path;
}

/** Most folders shown for one directory; the rest are cut off and the person is told. */
export const LIST_LIMIT = 1000;
/** Seconds before core ends a listing; a slow ssh machine should not hang the picker. */
export const LIST_TIMEOUT_S = 10;

/** Reads `$HOME` on the machine. A constant script: no user data goes into it. */
export const HOME_ARGV: readonly string[] = ['sh', '-c', 'printf %s "$HOME"'];

/** Prints `G` or `D` and the path, NUL-separated, for each folder found (`G`: it holds `.git`). */
const MARK_SCRIPT = 'for d; do if [ -e "$d/.git" ]; then printf "G\\0%s\\0" "$d"; else printf "D\\0%s\\0" "$d"; fi; done';

/**
 * The sub-folders of `dir`, hidden ones left out. Only `-mindepth`, `-maxdepth`, `-type` and `-name`
 * (GNU and BSD find both have them) and a constant `sh` script; `dir` is one argv element, never
 * part of a shell line.
 */
export const listArgv = (dir: string): string[] => [
  'find', absolute(dir), '-mindepth', '1', '-maxdepth', '1', '-type', 'd', '!', '-name', '.*',
  '-exec', 'sh', '-c', MARK_SCRIPT, 'sh', '{}', '+',
];

/** Succeeds only when `path` is a folder. */
export const isDirArgv = (path: string): string[] => ['test', '-d', absolute(path)];

export interface FolderEntry {
  name: string;
  path: string;
  git: boolean;
}

export interface Listing {
  entries: FolderEntry[];
  /** More folders existed than `LIST_LIMIT`. */
  more: boolean;
}

const byName = (a: FolderEntry, b: FolderEntry): number =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name);

/** Decodes the base64 `stdout` of `machine.exec`. */
export function decodeOutput(base64: string): string {
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Reads what `listArgv` printed. BSD find prints `dir//name` for a `dir` that ends in `/` and GNU
 * `/name` for the root, so only the last segment is trusted as the name and the path is rebuilt.
 */
export function parseListing(text: string, dir: string): Listing {
  const parts = text.split('\0');
  const entries: FolderEntry[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const mark = parts[i];
    const path = parts[i + 1];
    if ((mark !== 'G' && mark !== 'D') || !path) continue;
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!name || name.startsWith('.')) continue;
    entries.push({ name, path: joinPath(dir, name), git: mark === 'G' });
  }
  entries.sort(byName);
  return { entries: entries.slice(0, LIST_LIMIT), more: entries.length > LIST_LIMIT };
}
