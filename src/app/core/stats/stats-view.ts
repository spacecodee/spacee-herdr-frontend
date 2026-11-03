import type { AiShare, RepoStats, Stats } from './stats-count';

/** "35m", "4h 12m", "3d 2h": short enough for a tile. */
export function medianText(hours: number | null): string {
  if (hours === null) return '—';
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (hours < 48) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/** PRs merged today: the last day of this week that is not in the future. */
export const mergedToday = (s: Stats): number => s.days.filter((d) => !d.future).at(-1)?.merged ?? 0;

export interface WeekBar {
  merged: number;
  /** 0-100 of the tallest bar; a week with merges is never thinner than a sliver. */
  height: number;
  current: boolean;
  /** The count is written above the tallest bar and the current one. */
  labeled: boolean;
}

export function weekBars(weeks: Stats['weeks']): WeekBar[] {
  const max = Math.max(1, ...weeks.map((w) => w.merged));
  const peak = weeks.some((w) => w.merged > 0) ? weeks.map((w) => w.merged).lastIndexOf(max) : -1;
  return weeks.map((w, i) => ({
    merged: w.merged,
    height: w.merged === 0 ? 0 : Math.max(4, Math.round((100 * w.merged) / max)),
    current: i === weeks.length - 1,
    labeled: i === peak || i === weeks.length - 1,
  }));
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
/** "Aug 18": where the chart starts. */
export const startLabel = (weeks: Stats['weeks']): string => (weeks.length ? dayFormat.format(weeks[0].start) : '');

export type AiKey = 'claude' | 'codex' | 'both' | 'none';
export interface AiSegment {
  key: AiKey;
  label: string;
  count: number;
  /** Rounded down, as the Herdr mod does. */
  percent: number;
}

const AI_LABELS: Record<AiKey, string> = { claude: 'Claude', codex: 'Codex', both: 'Both', none: 'No agent' };

/** Claude, Codex, Both and No agent in that order, without the empty ones. */
export function aiSegments(ai: AiShare): AiSegment[] {
  if (ai.total === 0) return [];
  return (['claude', 'codex', 'both', 'none'] as const)
    .filter((key) => ai[key] > 0)
    .map((key) => ({ key, label: AI_LABELS[key], count: ai[key], percent: Math.floor((100 * ai[key]) / ai.total) }));
}

export interface RepoRow {
  repo: string;
  /** The repository name; the owner is added only when two repositories share a name. */
  name: string;
  prs: string;
  commits: string;
  /** 0-100 of the repository with the most PRs. */
  share: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function repoRows(repos: RepoStats[]): RepoRow[] {
  const max = Math.max(1, ...repos.map((r) => r.merged));
  const short = repos.map((r) => r.repo.split('/')[1] ?? r.repo);
  return repos.map((r, i) => ({
    repo: r.repo,
    name: short.filter((n) => n === short[i]).length > 1 ? r.repo : short[i],
    prs: plural(r.merged, 'PR', 'PRs'),
    commits: plural(r.commits, 'commit', 'commits'),
    share: Math.round((100 * r.merged) / max),
  }));
}
