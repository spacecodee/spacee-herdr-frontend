import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Machines } from '../../core/machines/machines';
import { Stats, type MachineStats } from '../../core/stats/stats';
import { buildStats, type PrRow } from '../../core/stats/stats-count';
import { StatsPage } from '../../features/stats/stats';

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Twelve weeks of made-up PRs: 3 today, 9 this week, the rest spread over the earlier weeks. */
function fixtureNumbers() {
  const prs: PrRow[] = [];
  let n = 0;
  const add = (repo: string, ago: number, ai: PrRow['ai'], hours = 4.2) => {
    const merged = NOW - ago;
    prs.push({ repo, number: ++n, createdAt: new Date(merged - hours * HOUR).toISOString(), mergedAt: new Date(merged).toISOString(), closedAt: new Date(merged).toISOString(), headRefName: 'feat', baseRefName: 'develop', ai });
  };
  const claude = { claude: true, codex: false };
  const codex = { claude: false, codex: true };
  const both = { claude: true, codex: true };
  const none = { claude: false, codex: false };
  const perWeek = [4, 6, 5, 8, 7, 9, 6, 11, 8, 10, 7];
  perWeek.forEach((count, w) => {
    for (let i = 0; i < count; i++) add(['me/api', 'me/web', 'me/acme-api'][i % 3], (11 - w) * 7 * DAY + (i % 5) * DAY + 3 * HOUR, w > 6 ? [claude, claude, codex, both, none][i % 5] : null);
  });
  for (let i = 0; i < 9; i++) add(['me/api', 'me/web', 'me/acme-api'][i % 3], i < 3 ? (i + 1) * HOUR : (i - 2) * 6 * HOUR + 20 * HOUR, [claude, claude, codex, both, none][i % 5]);
  prs.push({ repo: 'me/acme-api', number: ++n, createdAt: new Date(NOW - 20 * DAY).toISOString(), mergedAt: null, closedAt: new Date(NOW - 18 * DAY).toISOString(), headRefName: 'x', baseRefName: 'main', ai: null });
  return buildStats({
    prs,
    commits: { 'me/api': 74, 'me/web': 128, 'me/acme-api': 19 },
    reviews: { last30: 17, prev30: 9 },
    open: Array.from({ length: 5 }, () => ({ createdAt: new Date(NOW - 2 * DAY).toISOString(), headRefName: 'x', baseRefName: 'develop' })),
    now: NOW,
  });
}

function fixtureStats(scenario: string | null) {
  const idle: MachineStats = { status: 'idle', stats: null, at: null, refreshing: false, failed: false, message: '' };
  const ready: MachineStats = { ...idle, status: 'ready', stats: fixtureNumbers(), at: NOW - 12 * 60_000 };
  const state: MachineStats =
    scenario === 'loading'
      ? { ...idle, status: 'loading' }
      : scenario === 'not-logged-in'
        ? { ...idle, status: 'not-logged-in' }
        : scenario === 'error'
          ? { ...idle, status: 'error', message: 'GitHub did not answer. Check the connection and try again.' }
          : scenario === 'stale'
            ? { ...ready, failed: true, message: 'GitHub did not answer.' }
            : ready;
  return { view: () => () => state, load: () => Promise.resolve() };
}

/** Dev-only: the Stats screen with canned numbers. `?s=loading|not-logged-in|error|stale`. */
@Component({
  imports: [StatsPage],
  providers: [
    { provide: Stats, useFactory: () => fixtureStats(inject(ActivatedRoute).snapshot.queryParamMap.get('s')) },
    {
      provide: Machines,
      useValue: {
        rows: signal([
          { name: 'workstation', target: '', local: true, status: null },
          { name: 'gandalf', target: 'me@gandalf', local: false, status: { kind: 'connected', dot: 'done', label: 'Connected' } },
        ]).asReadonly(),
      },
    },
  ],
  templateUrl: './stats-fixture.html',
})
export class StatsFixture {}
