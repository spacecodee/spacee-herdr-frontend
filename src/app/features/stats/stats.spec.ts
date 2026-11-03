import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Machines, type MachineRow } from '../../core/machines/machines';
import { machineStatus } from '../../core/machines/machine-format';
import { buildStats, type PrRow, type Stats as StatsNumbers } from '../../core/stats/stats-count';
import { Stats, type MachineStats } from '../../core/stats/stats';
import { GH_LOGIN_COMMAND, StatsPage } from './stats';

const NOW = new Date(2026, 10, 4, 12).getTime(); // a Wednesday
const iso = (d: Date) => d.toISOString();
const pr = (n: number, repo: string, merged: Date, ai: PrRow['ai']): PrRow => ({
  repo, number: n, createdAt: iso(new Date(+merged - 4 * 3_600_000)), mergedAt: iso(merged), closedAt: iso(merged),
  headRefName: 'f', baseRefName: 'develop', ai,
});
const day = (d: number, h = 9) => new Date(2026, 10, d, h);
const numbers = (): StatsNumbers =>
  buildStats({
    prs: [
      pr(1, 'me/bridge', day(4, 8), { claude: true, codex: false }),
      pr(2, 'me/bridge', day(3), { claude: true, codex: false }),
      pr(3, 'me/front', day(2), { claude: false, codex: true }),
      pr(4, 'me/front', day(1), { claude: false, codex: false }),
      pr(5, 'me/bridge', new Date(2026, 9, 21), { claude: true, codex: true }),
    ],
    commits: { 'me/bridge': 74, 'me/front': 1 },
    reviews: { last30: 17, prev30: 4 },
    open: [{ createdAt: iso(day(1)), headRefName: 'x', baseRefName: 'develop' }],
    now: NOW,
  });

const IDLE: MachineStats = { status: 'idle', stats: null, at: null, refreshing: false, failed: false, message: '' };
const ready = (over: Partial<MachineStats> = {}): MachineStats => ({ ...IDLE, status: 'ready', stats: numbers(), at: NOW - 12 * 60_000, ...over });
const row = (name: string, state: string, local = false): MachineRow => ({
  name, target: local ? '' : name, local, status: local ? null : machineStatus({ state, version: '0.4.0' }, '0.4.0', 0),
});

describe('StatsPage', () => {
  const states = signal<Record<string, MachineStats>>({});
  const rows = signal<MachineRow[]>([]);
  const load = vi.fn(() => Promise.resolve());
  let fixture: ComponentFixture<StatsPage>;
  let from: string | null;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(s: string) => el().querySelector<T>(s);
  const text = () => el().textContent!.replace(/\s+/g, ' ');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    from = null;
    states.set({ '': ready() });
    rows.set([row('workstation', '', true), row('gandalf', 'connected')]);
    load.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => from } } } },
        { provide: Stats, useValue: { view: (m: string) => () => states()[m] ?? IDLE, load } },
        { provide: Machines, useValue: { rows } },
      ],
    });
  });
  afterEach(() => vi.useRealTimers());

  function create() {
    fixture = TestBed.createComponent(StatsPage);
    fixture.detectChanges();
  }

  it('opens the numbers of this machine, from the cache when it is fresh', () => {
    create();
    expect(load).toHaveBeenCalledWith('');
    expect(load).not.toHaveBeenCalledWith('', true);
  });

  it('shows Today and This week, then the PR chart with a bar per week', () => {
    create();
    expect(q('[data-tile="today"]')!.textContent).toContain('1');
    expect(q('[data-tile="week"]')!.textContent).toContain('3');
    expect(text()).toContain('PRs merged per week');
    expect(text()).toContain('12 weeks');
    const bars = el().querySelectorAll('[data-week-bar]');
    expect(bars).toHaveLength(12);
    expect(bars[11].hasAttribute('data-current')).toBe(true);
    expect(bars[10].hasAttribute('data-current')).toBe(false);
    expect(q('[data-chart]')!.getAttribute('aria-label')).toContain('PRs merged per week');
    expect(text()).toContain('This week');
  });

  it('shows median time to merge, open PRs, reviews given and merge rate', () => {
    create();
    expect(q('[data-tile="median"]')!.textContent).toContain('4h');
    expect(q('[data-tile="open"]')!.textContent).toContain('1');
    expect(q('[data-tile="reviews"]')!.textContent).toContain('17');
    expect(q('[data-tile="rate"]')!.textContent).toContain('100%');
  });

  it('shows the AI share as a stacked bar with a legend that rounds down', () => {
    create();
    const legend = q('[data-ai-legend]')!.textContent!.replace(/\s+/g, ' ');
    expect(legend).toContain('Claude 40%');
    expect(legend).toContain('Codex 20%');
    expect(legend).toContain('Both 20%');
    expect(legend).toContain('No agent 20%');
    expect(el().querySelectorAll('[data-ai-segment]')).toHaveLength(4);
  });

  it('says so when no merged PR could be rated', () => {
    states.set({ '': ready({ stats: { ...numbers(), ai: { claude: 0, codex: 0, both: 0, none: 0, total: 0 } } }) });
    create();
    expect(q('[data-ai-legend]')).toBeNull();
    expect(text()).toContain('No merged PRs in the last 30 days');
  });

  it('lists the repositories with PRs, commits and a bar', () => {
    create();
    const rowsEl = [...el().querySelectorAll('[data-repo]')];
    expect(rowsEl.map((r) => r.textContent!.replace(/\s+/g, ' ').replace(/\s*·\s*/, ' · ').trim())).toEqual(['bridge3 PRs · 74 commits', 'front2 PRs · 1 commit']);
    expect(rowsEl[0].querySelector('[data-repo-bar]')).not.toBeNull();
  });

  it('says how old the numbers are and refreshes by force', () => {
    create();
    expect(text()).toContain('Updated 12 min ago');
    q<HTMLButtonElement>('[data-refresh]')!.click();
    expect(load).toHaveBeenCalledWith('', true);
  });

  it('disables Refresh while loading', () => {
    states.set({ '': ready({ refreshing: true }) });
    create();
    expect(q<HTMLButtonElement>('[data-refresh]')!.disabled).toBe(true);
  });

  it('loads the machine you pick', () => {
    create();
    const chips = el().querySelectorAll<HTMLButtonElement>('[data-machine-chip]');
    chips[1].click();
    fixture.detectChanges();
    expect(load).toHaveBeenCalledWith('gandalf');
  });

  it('shows a skeleton with the wait notice while counting', () => {
    states.set({ '': { ...IDLE, status: 'loading' } });
    create();
    expect(q('[data-loading]')!.getAttribute('aria-busy')).toBe('true');
    expect(text()).toContain('Counting your PRs…');
    expect(text()).toContain('This can take about 15 seconds.');
    expect(q('[data-tile]')).toBeNull();
  });

  it('asks to log in to gh, with the command to copy', async () => {
    states.set({ '': { ...IDLE, status: 'not-logged-in' } });
    const write = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText: write } });
    create();
    expect(q('[data-not-logged-in]')!.textContent).toContain('gh is not logged in');
    expect(q('[data-not-logged-in]')!.textContent).toContain(GH_LOGIN_COMMAND);
    q<HTMLButtonElement>('[data-copy]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledWith('gh auth login');
    vi.unstubAllGlobals();
  });

  it('shows an error with its sentence and Retry', () => {
    states.set({ '': { ...IDLE, status: 'error', message: 'GitHub did not answer. Check the connection and try again.' } });
    create();
    expect(q('[data-error]')!.textContent).toContain('Could not load stats');
    expect(q('[data-error]')!.textContent).toContain('GitHub did not answer');
    q<HTMLButtonElement>('[data-retry]')!.click();
    expect(load).toHaveBeenCalledWith('', true);
  });

  it('keeps the old numbers and says the refresh failed', () => {
    states.set({ '': ready({ failed: true, message: 'GitHub did not answer.' }) });
    create();
    expect(q('[data-stale]')!.textContent).toContain('GitHub did not answer.');
    expect(q('[data-tile]')).not.toBeNull();
  });

  it('goes back to Settings when opened from there, else home', () => {
    from = '/settings';
    create();
    expect(q<HTMLAnchorElement>('a[aria-label="Back"]')!.getAttribute('href')).toBe('/settings');
  });
});
