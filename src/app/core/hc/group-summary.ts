import type { Terminal } from './types';

export interface GroupSummary {
  total: number;
  /** What the collapsed header calls out: blocked beats working; null when neither applies. */
  kind: 'blocked' | 'working' | null;
  count: number;
}

export function summarizeStates(states: (string | null | undefined)[]): GroupSummary {
  const count = (state: string) => states.filter((s) => s === state).length;
  const blocked = count('blocked');
  if (blocked > 0) return { total: states.length, kind: 'blocked', count: blocked };
  const working = count('working');
  if (working > 0) return { total: states.length, kind: 'working', count: working };
  return { total: states.length, kind: null, count: 0 };
}

export function summarize(terminals: Terminal[]): GroupSummary {
  return summarizeStates(terminals.map((t) => t.status?.state));
}
