import type { Token, TokenKind } from './highlight';

export interface Match {
  line: number;
  start: number;
  end: number;
}

/** Every case-insensitive occurrence of `query` (taken literally), line by line, left to right, without overlaps. */
export function findMatches(lines: readonly string[], query: string): Match[] {
  if (query === '') return [];
  const needle = query.toLowerCase();
  const out: Match[] = [];
  lines.forEach((text, line) => {
    const hay = text.toLowerCase();
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
      out.push({ line, start: at, end: at + needle.length });
    }
  });
  return out;
}

export interface LineMatch {
  start: number;
  end: number;
  current: boolean;
}

export interface Segment {
  kind: TokenKind;
  text: string;
  hit: 'hit' | 'current' | null;
}

/** A line's tokens cut at the edges of its matches, so a hit can be drawn over any color. */
export function segmentLine(tokens: readonly Token[], matches: readonly LineMatch[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const token of tokens) {
    const from = at;
    const to = at + token.text.length;
    let cursor = from;
    for (const m of matches) {
      const s = Math.max(m.start, cursor);
      const e = Math.min(m.end, to);
      if (e <= s) continue;
      if (s > cursor) out.push({ kind: token.kind, text: token.text.slice(cursor - from, s - from), hit: null });
      out.push({ kind: token.kind, text: token.text.slice(s - from, e - from), hit: m.current ? 'current' : 'hit' });
      cursor = e;
    }
    if (cursor < to) out.push({ kind: token.kind, text: token.text.slice(cursor - from), hit: null });
    at = to;
  }
  return out;
}
