import { MAX_DIFF_ROWS } from './changes-argv';

export interface NumstatFile {
  path: string;
  /** Where a renamed file came from. */
  from?: string;
  added: number;
  deleted: number;
  binary: boolean;
}

export type StatusLetter = 'M' | 'A' | 'D' | 'R';

/**
 * `git diff --numstat -z`: `added TAB deleted TAB path NUL`. A rename is `added TAB deleted TAB NUL old
 * NUL new NUL`. Binary files print `-` for both counts. No path is quoted in `-z` mode.
 */
export function parseNumstat(out: string): NumstatFile[] {
  const parts = out.split('\0');
  const files: NumstatFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const head = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(parts[i]);
    if (!head) continue;
    const binary = head[1] === '-';
    const counts = { added: binary ? 0 : Number(head[1]), deleted: binary ? 0 : Number(head[2]), binary };
    if (head[3] === '') {
      const [from, path] = [parts[i + 1], parts[i + 2]];
      i += 2;
      if (path) files.push({ path, from, ...counts });
    } else {
      files.push({ path: head[3], ...counts });
    }
  }
  return files;
}

/** `git diff --name-status -z`: `LETTER NUL path NUL`; a rename or copy has two paths (old, new). */
export function parseNameStatus(out: string): Map<string, StatusLetter> {
  const parts = out.split('\0');
  const map = new Map<string, StatusLetter>();
  for (let i = 0; i + 1 < parts.length; i++) {
    const code = parts[i];
    if (!/^[A-Z]\d*$/.test(code)) continue;
    const moved = code[0] === 'R' || code[0] === 'C';
    const path = moved ? parts[i + 2] : parts[i + 1];
    if (path) map.set(path, code[0] === 'A' || code[0] === 'D' || code[0] === 'R' ? (code[0] as StatusLetter) : 'M');
    i += moved ? 2 : 1;
  }
  return map;
}

export function sumFiles(files: readonly NumstatFile[]): { files: number; added: number; deleted: number } {
  return files.reduce((t, f) => ({ files: t.files + 1, added: t.added + f.added, deleted: t.deleted + f.deleted }), {
    files: 0,
    added: 0,
    deleted: 0,
  });
}

export type DiffRow =
  | { kind: 'hunk'; text: string }
  | { kind: 'ctx'; old: number; new: number; text: string }
  | { kind: 'del'; old: number; text: string }
  | { kind: 'add'; new: number; text: string };

export interface ParsedDiff {
  rows: DiffRow[];
  /** More than `MAX_DIFF_ROWS` rows existed. */
  truncated: boolean;
}

/** A unified diff to rows with old and new line numbers. The file header lines before the first `@@` are dropped. */
export function parseDiff(text: string): ParsedDiff {
  const rows: DiffRow[] = [];
  let old = 0;
  let next = 0;
  let inHunk = false;
  for (const line of text.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    let row: DiffRow | null = null;
    if (hunk) {
      inHunk = true;
      old = Number(hunk[1]);
      next = Number(hunk[2]);
      row = { kind: 'hunk', text: line };
    } else if (inHunk && line.startsWith('+')) row = { kind: 'add', new: next++, text: line.slice(1) };
    else if (inHunk && line.startsWith('-')) row = { kind: 'del', old: old++, text: line.slice(1) };
    else if (inHunk && line.startsWith(' ')) row = { kind: 'ctx', old: old++, new: next++, text: line.slice(1) };
    if (!row) continue;
    if (rows.length === MAX_DIFF_ROWS) return { rows, truncated: true };
    rows.push(row);
  }
  return { rows, truncated: false };
}

/** The content of an untracked file as a diff where every line is added. */
export function addedRows(text: string): ParsedDiff {
  if (text === '') return { rows: [], truncated: false };
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const rows: DiffRow[] = lines.slice(0, MAX_DIFF_ROWS).map((line, i) => ({ kind: 'add', new: i + 1, text: line }));
  return { rows, truncated: lines.length > MAX_DIFF_ROWS };
}
