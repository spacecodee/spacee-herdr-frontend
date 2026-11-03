import type { Terminal } from './types';

export interface GroupSummary {
  total: number;
  /** What the collapsed header calls out: blocked beats working; null when neither applies. */
  kind: 'blocked' | 'working' | null;
  count: number;
}

export function summarize(terminals: Terminal[]): GroupSummary {
  const count = (state: string) => terminals.filter((t) => t.status?.state === state).length;
  const blocked = count('blocked');
  if (blocked > 0) return { total: terminals.length, kind: 'blocked', count: blocked };
  const working = count('working');
  if (working > 0) return { total: terminals.length, kind: 'working', count: working };
  return { total: terminals.length, kind: null, count: 0 };
}
