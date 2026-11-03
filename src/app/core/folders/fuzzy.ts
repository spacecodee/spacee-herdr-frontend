export interface FuzzyMatch {
  /** Lower ranks first: a contiguous match beats a scattered one, and earlier beats later. */
  rank: number;
  /** Positions of `text` that matched, for highlighting. */
  indices: number[];
}

/**
 * Quick-open style match: every typed character appears in order (a subsequence), and a run of
 * the characters together ranks ahead of scattered ones. Case does not matter.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === '') return { rank: 0, indices: [] };
  const at = t.indexOf(q);
  if (at >= 0) return { rank: at, indices: Array.from({ length: q.length }, (_, i) => at + i) };
  const indices: number[] = [];
  let from = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    indices.push(found);
    from = found + 1;
  }
  const span = indices[indices.length - 1] - indices[0];
  return { rank: 1000 + span * 10 + indices[0], indices };
}

export interface Piece {
  text: string;
  on: boolean;
}

/** Splits `text` into runs that are matched or not, so the template can mark the matched ones. */
export function highlight(text: string, indices: readonly number[]): Piece[] {
  const on = new Set(indices);
  const pieces: Piece[] = [];
  for (let i = 0; i < text.length; i++) {
    const isOn = on.has(i);
    const last = pieces[pieces.length - 1];
    if (last && last.on === isOn) last.text += text[i];
    else pieces.push({ text: text[i], on: isOn });
  }
  return pieces;
}
