import type { AgentKind } from '../list/conversations';
import { elapsedShare, paceText, resetText, tierOf, type Tier } from './quota-format';
import type { ProviderQuota, QuotaWindow } from './quota-parse';

export interface BarView {
  label: string;
  /** 0-100, always what was used: the color and bar length follow it even when the figure shows what is left. */
  used: number;
  tier: Tier;
  /** Where the pace tick sits, 0-100; null when the window length is unknown. */
  tick: number | null;
  figure: string;
  /** "Running low" / "Almost out" / "". */
  note: string;
  pace: string;
  /** lucide icon name for the pace trend; empty without a pace. */
  paceIcon: string;
  reset: string;
}

export function barOf(w: QuotaWindow, now: number, remaining: boolean): BarView {
  const tier = tierOf(w.percentUsed);
  const share = elapsedShare(w.kind, w.resetsAt, now);
  return {
    label: w.label,
    used: w.percentUsed,
    tier,
    tick: share === null ? null : share * 100,
    figure: remaining ? `${100 - w.percentUsed}% left` : `${w.percentUsed}% used`,
    note: tier === 'blocked' ? 'Almost out' : tier === 'low' ? 'Running low' : '',
    pace: paceText(w.pace),
    paceIcon: w.pace === 'ahead' ? 'lucideTrendingUp' : w.pace === 'under' ? 'lucideTrendingDown' : w.pace === 'on' ? 'lucideMinus' : '',
    reset: resetText(w.resetsAt, now),
  };
}

/** The two figures the home indicator and Settings show. */
export function claudeFigures(providers: readonly ProviderQuota[]): { session: QuotaWindow | null; weekly: QuotaWindow | null } {
  const windows = providers.find((p) => p.provider === 'claude' && p.status === 'ok')?.windows ?? [];
  return {
    session: windows.find((w) => w.id === 'five_hour') ?? null,
    weekly: windows.find((w) => w.id === 'seven_day') ?? null,
  };
}

const NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  copilot: 'Copilot',
  agy: 'Antigravity',
  'opencode-go': 'OpenCode Go',
};

export function providerName(id: string): string {
  return NAMES[id] ?? (id ? id[0].toUpperCase() + id.slice(1) : id);
}

const AGENTS: Record<string, AgentKind> = { claude: 'claude', codex: 'codex', 'opencode-go': 'opencode', agy: 'antigravity' };

/** The mark a provider shares with the agent of the same name; others get the generic one. */
export function providerAgent(id: string): AgentKind {
  return AGENTS[id] ?? 'generic';
}

/** Cards for providers with numbers (or an error to show); signed-out ones are listed by name. */
export function shownProviders(providers: readonly ProviderQuota[]): { cards: ProviderQuota[]; signedOut: string[] } {
  return {
    cards: providers.filter((p) => p.status === 'error' || (p.status === 'ok' && p.windows.length > 0)),
    signedOut: providers.filter((p) => p.status === 'signed-out').map((p) => providerName(p.provider)),
  };
}

/** "max" -> "Max"; anything else quota-axi adds stays as it is. */
export function planLabel(plan: string | null): string | null {
  return plan ? plan[0].toUpperCase() + plan.slice(1) : null;
}
