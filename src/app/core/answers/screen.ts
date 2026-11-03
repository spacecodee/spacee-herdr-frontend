import type { Profile } from './profiles';

export interface ScreenRow {
  kind: 'option' | 'other' | 'submit';
  /** Option index for `option`, else the row's place after the options. */
  index: number;
  cursor: boolean;
  /** Checkbox state when the row shows one. */
  checked: boolean | undefined;
}

interface ParsedLine {
  cursor: boolean;
  checked: boolean | undefined;
  text: string;
}

const LINE =
  /^\s*(?<m>[❯›>▸→▶»])?\s*(?:\d+[.)]\s+)?(?:(?<b>\[[^\]]?\])\s*|(?<g>[☐☑☒✔✓◉○◯●])\s+)?(?<t>.*?)\s*$/u;
const CHECKED = /[✔✓xX☑☒◉●]/u;

export function parseLine(raw: string): ParsedLine {
  const m = LINE.exec(raw);
  if (!m?.groups) return { cursor: false, checked: undefined, text: raw.trim() };
  const box = m.groups['b'] ?? m.groups['g'];
  return {
    cursor: m.groups['m'] !== undefined,
    checked: box === undefined ? undefined : CHECKED.test(box),
    text: m.groups['t'] ?? '',
  };
}

export const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Rows of the screen that belong to this question, in order, or null when they do not all show. */
export function readRows(
  screen: string,
  profile: Profile,
  options: string[],
  need: { other: boolean; submit: boolean },
): ScreenRow[] | null {
  const lines = screen.split('\n').map(parseLine);
  const rows: ScreenRow[] = [];
  let at = 0;
  const find = (match: (text: string) => boolean): ParsedLine | null => {
    for (let i = at; i < lines.length; i++) {
      if (match(lines[i].text)) {
        at = i + 1;
        return lines[i];
      }
    }
    return null;
  };
  for (let i = 0; i < options.length; i++) {
    const label = normalize(options[i]);
    const line = find((t) => normalize(t) === label || normalize(t).startsWith(label + ' '));
    if (!line) return null;
    rows.push({ kind: 'option', index: i, cursor: line.cursor, checked: line.checked });
  }
  const other = profile.other ? find((t) => profile.other!.test(normalize(t))) : null;
  if (other) rows.push({ kind: 'other', index: options.length, cursor: other.cursor, checked: other.checked });
  else if (need.other) return null;
  if (need.submit) {
    const submit = find((t) => /^submit$/i.test(normalize(t)));
    if (!submit) return null;
    rows.push({ kind: 'submit', index: rows.length, cursor: submit.cursor, checked: undefined });
  }
  return rows;
}

/** Numbered rows of a review/confirm list (`1. Submit answers`, `2. Cancel`), cursor included. */
export function readList(screen: string): { text: string; cursor: boolean }[] {
  return screen
    .split('\n')
    .filter((l) => /^\s*[❯›>▸→▶»]?\s*\d+[.)]\s+\S/u.test(l))
    .map((l) => {
      const p = parseLine(l);
      return { text: normalize(p.text), cursor: p.cursor };
    });
}
