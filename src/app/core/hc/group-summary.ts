import type { Terminal } from './types';

/** How many terminals of a group need a look: blocked and working are called out, the rest are not. */
export interface GroupSummary {
  total: number;
  blocked: number;
  working: number;
}

export function summarizeStates(states: (string | null | undefined)[]): GroupSummary {
  const count = (state: string) => states.filter((s) => s === state).length;
  return { total: states.length, blocked: count('blocked'), working: count('working') };
}

export function summarize(terminals: Terminal[]): GroupSummary {
  return summarizeStates(terminals.map((t) => t.status?.state));
}
