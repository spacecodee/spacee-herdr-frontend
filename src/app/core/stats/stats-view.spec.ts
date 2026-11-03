import type { Stats } from './stats-count';
import { aiSegments, medianText, mergedToday, repoRows, startLabel, weekBars } from './stats-view';

describe('stats-view', () => {
  it('medianText: minutes, hours with minutes, days with hours, and nothing', () => {
    expect(medianText(null)).toBe('—');
    expect(medianText(0.25)).toBe('15m');
    expect(medianText(0.001)).toBe('1m');
    expect(medianText(4 + 12 / 60)).toBe('4h 12m');
    expect(medianText(3)).toBe('3h');
    expect(medianText(74)).toBe('3d 2h');
    expect(medianText(72)).toBe('3d');
  });

  it('mergedToday is the last day that is not in the future', () => {
    const days = [0, 1, 2, 3].map((i) => ({ start: i, merged: i + 1, future: i > 1 }));
    expect(mergedToday({ days } as Stats)).toBe(2);
    expect(mergedToday({ days: [] } as unknown as Stats)).toBe(0);
  });

  it('weekBars scales to the tallest week, labels the tallest and the current one', () => {
    const bars = weekBars([0, 11, 3, 9].map((merged, i) => ({ start: i, merged })));
    expect(bars.map((b) => b.height)).toEqual([0, 100, 27, 82]);
    expect(bars.map((b) => b.current)).toEqual([false, false, false, true]);
    expect(bars.map((b) => b.labeled)).toEqual([false, true, false, true]);
    expect(weekBars([{ start: 0, merged: 1 }, { start: 1, merged: 500 }])[0].height).toBe(4);
  });

  it('weekBars of an empty history are flat and only the current week is labeled', () => {
    const bars = weekBars([{ start: 0, merged: 0 }, { start: 1, merged: 0 }]);
    expect(bars.map((b) => b.height)).toEqual([0, 0]);
    expect(bars.map((b) => b.labeled)).toEqual([false, true]);
  });

  it('startLabel is the first week as "Aug 18"', () => {
    expect(startLabel([{ start: new Date(2026, 7, 18).getTime(), merged: 0 }])).toBe('Aug 18');
    expect(startLabel([])).toBe('');
  });

  it('aiSegments rounds down and leaves out the empty ones', () => {
    const segs = aiSegments({ claude: 6, codex: 3, both: 2, none: 0, total: 11 });
    expect(segs.map((s) => [s.key, s.label, s.percent])).toEqual([['claude', 'Claude', 54], ['codex', 'Codex', 27], ['both', 'Both', 18]]);
    expect(aiSegments({ claude: 0, codex: 0, both: 0, none: 0, total: 0 })).toEqual([]);
  });

  it('repoRows names the repository, pluralises and scales bars to the busiest one', () => {
    const rows = repoRows([
      { repo: 'me/bridge', merged: 4, commits: 10 },
      { repo: 'me/front', merged: 1, commits: 1 },
    ]);
    expect(rows).toEqual([
      { repo: 'me/bridge', name: 'bridge', prs: '4 PRs', commits: '10 commits', share: 100 },
      { repo: 'me/front', name: 'front', prs: '1 PR', commits: '1 commit', share: 25 },
    ]);
  });

  it('repoRows keeps the owner when two repositories share a name', () => {
    const rows = repoRows([{ repo: 'a/app', merged: 2, commits: 0 }, { repo: 'b/app', merged: 1, commits: 0 }, { repo: 'a/x', merged: 1, commits: 0 }]);
    expect(rows.map((r) => r.name)).toEqual(['a/app', 'b/app', 'x']);
  });
});
