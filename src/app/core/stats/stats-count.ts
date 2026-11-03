// Your own delivery numbers from raw GitHub rows. Pure: no Angular, no I/O.
//
// Ported to TypeScript from the Herdr "stats" mod, mods/stats/stats.js
// (https://github.com/Lakris2407/herdr-mods/tree/main/stats), MIT License,
// Copyright (c) 2026 Lakris2407. The counting rules are unchanged; display helpers differ.

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface AiMarks {
  claude: boolean;
  codex: boolean;
}

/** One PR as the loader hands it over: texts are already reduced to `ai`. */
export interface PrRow {
  repo: string;
  number: number;
  state?: string;
  createdAt: string;
  mergedAt?: string | null;
  closedAt?: string | null;
  headRefName: string;
  baseRefName: string;
  ai?: AiMarks | null;
}

export interface Reviews {
  last30: number;
  prev30: number;
}

export interface StatsInput {
  prs: PrRow[];
  commits?: Record<string, number>;
  reviews?: Reviews;
  open?: Pick<PrRow, 'createdAt' | 'headRefName' | 'baseRefName'>[];
  now: number;
  weeks?: number;
}

export interface RepoStats {
  repo: string;
  merged: number;
  commits: number;
}

export interface AiShare {
  claude: number;
  codex: number;
  both: number;
  none: number;
  total: number;
}

export interface Stats {
  weeks: { start: number; merged: number }[];
  days: { start: number; merged: number; future: boolean }[];
  mergedThisWeek: number;
  mergedLastWeek: number;
  merged30: number;
  mergedPrev30: number;
  medianHours: number | null;
  open: number;
  oldestOpenDays: number | null;
  repos: RepoStats[];
  commits30: number;
  ai: AiShare;
  reviews: Reviews;
  mergeRate: number | null;
  decided: number;
}

/** Monday 00:00 in local time, so "this week" matches your own calendar. */
export function weekStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** The start of each of the last `count` weeks, oldest first, ending with this week. */
export function weekStarts(now: number, count: number): number[] {
  const current = weekStart(now);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * (count - 1 - i));
    return d.getTime();
  });
}

/** A release (develop -> main) repeats work already counted when it merged into develop. */
export const isPromotion = (pr: Pick<PrRow, 'headRefName' | 'baseRefName'>): boolean =>
  pr.headRefName === 'develop' && pr.baseRefName === 'main';

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const between = (iso: string, from: number, to: number): boolean => {
  const t = Date.parse(iso);
  return t >= from && t < to;
};

/**
 * Which AI tools made a PR. "Codex" in a PR text usually means a Codex review, so only its own
 * sign-off line counts there; branch names and commit trailers are the stronger marks.
 */
export function aiTools({ body = '', headRefName = '', messages = [] }: { body?: string; headRefName?: string; messages?: string[] }): AiMarks {
  const trailers = messages.join('\n');
  return {
    claude: /^co-authored-by:\s*claude/im.test(trailers) || /generated with \[?claude code/i.test(body) || /^claude\//.test(headRefName),
    codex: /^co-authored-by:\s*codex/im.test(trailers) || /generated with \[?codex/i.test(body) || /^codex\//.test(headRefName),
  };
}

export function buildStats({ prs, commits, reviews, open, now, weeks = 12 }: StatsInput): Stats {
  const work = dedupe(prs).filter((pr) => !isPromotion(pr));
  const merged = work.filter((pr) => pr.mergedAt);
  const starts = weekStarts(now, weeks);
  const thisWeek = starts[starts.length - 1];

  const perWeek = starts.map((start, i) => ({
    start,
    merged: merged.filter((pr) => between(pr.mergedAt!, start, starts[i + 1] ?? start + WEEK)).length,
  }));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() + i);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    return { start, merged: merged.filter((pr) => between(pr.mergedAt!, start, end)).length, future: start > now };
  });

  const last30 = merged.filter((pr) => between(pr.mergedAt!, now - 30 * DAY, now + 1));
  const prev30 = merged.filter((pr) => between(pr.mergedAt!, now - 60 * DAY, now - 30 * DAY));
  const hours = last30.map((pr) => (Date.parse(pr.mergedAt!) - Date.parse(pr.createdAt)) / 3_600_000);

  // Decided in the last 90 days: merged, or closed without a merge.
  const decided = work.filter((pr) => between(pr.mergedAt ?? pr.closedAt ?? '', now - 90 * DAY, now + 1));
  const rate = decided.length ? Math.round((100 * decided.filter((pr) => pr.mergedAt).length) / decided.length) : null;

  const byRepo: Record<string, number> = {};
  for (const pr of last30) byRepo[pr.repo] = (byRepo[pr.repo] ?? 0) + 1;
  const repos = Object.entries(byRepo)
    .map(([repo, n]) => ({ repo, merged: n, commits: commits?.[repo] ?? 0 }))
    .sort((a, b) => b.merged - a.merged || a.repo.localeCompare(b.repo));

  // AI share over the last 30 days' merged PRs that still had their texts loaded.
  const ai: AiShare = { claude: 0, codex: 0, both: 0, none: 0, total: 0 };
  for (const pr of last30) {
    if (!pr.ai) continue;
    ai.total++;
    ai[pr.ai.claude && pr.ai.codex ? 'both' : pr.ai.claude ? 'claude' : pr.ai.codex ? 'codex' : 'none']++;
  }

  const openPrs = (open ?? []).filter((pr) => !isPromotion(pr));
  const oldest = openPrs.length ? Math.max(...openPrs.map((pr) => Math.floor((now - Date.parse(pr.createdAt)) / DAY))) : null;

  return {
    weeks: perWeek,
    days,
    mergedThisWeek: perWeek[perWeek.length - 1].merged,
    mergedLastWeek: perWeek[perWeek.length - 2]?.merged ?? 0,
    merged30: last30.length,
    mergedPrev30: prev30.length,
    medianHours: median(hours),
    open: openPrs.length,
    oldestOpenDays: oldest,
    repos,
    commits30: Object.values(commits ?? {}).reduce((s, n) => s + n, 0),
    ai,
    reviews: reviews ?? { last30: 0, prev30: 0 },
    mergeRate: rate,
    decided: decided.length,
  };
}

/**
 * The same PR can come back from two search windows; numbers repeat across repos. At the AI cutoff
 * one copy has its AI marks and the other not: keep the one with marks.
 */
function dedupe(prs: PrRow[]): PrRow[] {
  const byKey = new Map<string, PrRow>();
  for (const pr of prs) {
    const key = `${pr.repo}#${pr.number}`;
    const seen = byKey.get(key);
    if (!seen?.ai || pr.ai) byKey.set(key, pr);
  }
  return [...byKey.values()];
}
