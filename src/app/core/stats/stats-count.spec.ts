// Tests ported from the Herdr "stats" mod, test/stats.test.mjs
// (https://github.com/Lakris2407/herdr-mods/tree/main/stats), MIT License,
// Copyright (c) 2026 Lakris2407.
import { aiTools, buildStats, isPromotion, median, weekStart, weekStarts, type PrRow } from './stats-count';

const at = (s: string) => new Date(s).getTime();
const iso = (s: string) => new Date(s).toISOString();

describe('stats-count', () => {
  it('weekStart is local Monday midnight', () => {
    const d = new Date(weekStart(at('2026-11-01T15:00:00')));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(26);
    expect(d.getHours()).toBe(0);
    expect(new Date(weekStart(at('2026-10-26T00:00:00'))).getDate()).toBe(26);
  });

  it('weekStarts ends with this week, oldest first', () => {
    const starts = weekStarts(at('2026-11-01T12:00:00'), 3);
    expect(starts.map((t) => new Date(t).getDate())).toEqual([12, 19, 26]);
  });

  it('a develop -> main release is a promotion; a hotfix to main is not', () => {
    expect(isPromotion({ headRefName: 'develop', baseRefName: 'main' })).toBe(true);
    expect(isPromotion({ headRefName: 'fix/x', baseRefName: 'main' })).toBe(false);
  });

  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('buildStats counts merges by week and day, skips releases and duplicates', () => {
    const now = at('2026-11-01T12:00:00');
    const pr = (number: number, created: string, merged: string | null, extra: Partial<PrRow> = {}): PrRow => ({
      repo: 'o/a', number, createdAt: iso(created), mergedAt: merged && iso(merged), closedAt: merged && iso(merged),
      headRefName: 'feat', baseRefName: 'develop', ...extra,
    });
    const prs = [
      pr(1, '2026-10-27T09:00:00', '2026-10-27T10:00:00'),
      pr(1, '2026-10-27T09:00:00', '2026-10-27T10:00:00'), // same PR from a second search window
      pr(2, '2026-11-01T08:00:00', '2026-11-01T11:00:00'),
      pr(3, '2026-10-20T08:00:00', '2026-10-21T08:00:00'),
      pr(4, '2026-10-31T08:00:00', '2026-10-31T09:00:00', { headRefName: 'develop', baseRefName: 'main' }),
      { ...pr(5, '2026-10-29T08:00:00', null), closedAt: iso('2026-10-29T09:00:00') },
    ];
    const s = buildStats({
      prs, commits: {}, reviews: { last30: 4, prev30: 2 },
      open: [{ createdAt: iso('2026-10-29T12:00:00'), headRefName: 'x', baseRefName: 'develop' }], now, weeks: 2,
    });
    expect(s.mergedThisWeek).toBe(2);
    expect(s.mergedLastWeek).toBe(1);
    expect(s.merged30).toBe(3);
    expect(s.days.map((d) => d.merged)).toEqual([0, 1, 0, 0, 0, 0, 1]);
    expect(s.medianHours).toBe(3);
    expect(s.mergeRate).toBe(75);
    expect(s.open).toBe(1);
    expect(s.oldestOpenDays).toBe(3);
  });

  it('PRs with the same number in two repos both count; repos rank by merges', () => {
    const now = at('2026-11-01T12:00:00');
    const pr = (repo: string, number: number): PrRow => ({
      repo, number, createdAt: iso('2026-10-30T08:00:00'), mergedAt: iso('2026-10-30T09:00:00'), headRefName: 'f', baseRefName: 'main',
    });
    const s = buildStats({ prs: [pr('o/a', 1), pr('o/b', 1), pr('o/b', 2)], commits: { 'o/a': 7, 'o/b': 3 }, now, weeks: 1 });
    expect(s.merged30).toBe(3);
    expect(s.repos).toEqual([{ repo: 'o/b', merged: 2, commits: 3 }, { repo: 'o/a', merged: 1, commits: 7 }]);
    expect(s.commits30).toBe(10);
  });

  it('aiTools reads trailers, sign-off lines and branch names, not review mentions', () => {
    expect(aiTools({ messages: ['fix\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'] })).toEqual({ claude: true, codex: false });
    expect(aiTools({ headRefName: 'codex/bugs' })).toEqual({ claude: false, codex: true });
    expect(aiTools({ messages: ['x\n\nCo-Authored-By: Codex <noreply@openai.com>\nCo-Authored-By: Claude <noreply@anthropic.com>'] })).toEqual({ claude: true, codex: true });
    expect(aiTools({ body: '🤖 Generated with Codex (spec and review by Claude Code)' })).toEqual({ claude: false, codex: true });
    expect(aiTools({ body: 'Codex review (gpt-6.1-sol, high): no findings' })).toEqual({ claude: false, codex: false });
  });

  it('a PR from two search windows keeps the copy with AI marks', () => {
    const now = at('2026-11-01T12:00:00');
    const pr = (ai: PrRow['ai']): PrRow => ({
      repo: 'o/a', number: 1, createdAt: iso('2026-10-30T08:00:00'), mergedAt: iso('2026-10-30T09:00:00'), headRefName: 'f', baseRefName: 'main', ai,
    });
    const s = buildStats({ prs: [pr({ claude: true, codex: false }), pr(null)], now, weeks: 1 });
    expect(s.ai).toEqual({ claude: 1, codex: 0, both: 0, none: 0, total: 1 });
  });

  it('AI share splits merged PRs into Claude, Codex, both and none', () => {
    const now = at('2026-11-01T12:00:00');
    const pr = (number: number, ai: PrRow['ai']): PrRow => ({
      repo: 'o/a', number, createdAt: iso('2026-10-30T08:00:00'), mergedAt: iso('2026-10-30T09:00:00'), headRefName: 'f', baseRefName: 'main', ai,
    });
    const s = buildStats({
      prs: [pr(1, { claude: true, codex: false }), pr(2, { claude: true, codex: true }), pr(3, { claude: false, codex: false }), pr(4, null)],
      now, weeks: 1,
    });
    expect(s.ai).toEqual({ claude: 1, codex: 0, both: 1, none: 1, total: 3 });
  });
});
