import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Machines, type MachineRow } from '../../../core/machines/machines';
import { machineStatus } from '../../../core/machines/machine-format';
import { Quota, type MachineQuota } from '../../../core/quota/quota';
import type { ProviderQuota } from '../../../core/quota/quota-parse';
import { UsageDisplay } from '../../../core/quota/usage-display';
import { Usage } from './usage';

const win = (id: string, kind: 'session' | 'weekly' | 'model', label: string, percentUsed: number, pace: 'ahead' | 'under' | null = null) => ({
  id, kind, label, percentUsed, pace, resetsAt: Date.now() + 2 * 3_600_000,
});
const claude: ProviderQuota = {
  provider: 'claude', plan: 'max', status: 'ok',
  windows: [win('five_hour', 'session', '5-hour', 72, 'ahead'), win('seven_day', 'weekly', 'Weekly', 95, 'under')],
};
const IDLE: MachineQuota = { status: 'idle', report: null, at: null, refreshing: false, failed: false, message: '' };
const ready = (providers: ProviderQuota[], over: Partial<MachineQuota> = {}): MachineQuota => ({
  ...IDLE, status: 'ready', report: { generatedAt: 1, providers }, at: Date.now() - 3 * 60_000, ...over,
});
const row = (name: string, state: string, local = false): MachineRow => ({
  name, target: local ? '' : name, local, status: local ? null : machineStatus({ state, version: '0.4.0' }, '0.4.0', 0),
});

describe('Usage', () => {
  const states = signal<Record<string, MachineQuota>>({});
  const rows = signal<MachineRow[]>([]);
  const remaining = signal(false);
  const set = vi.fn((v: boolean) => remaining.set(v));
  const load = vi.fn(() => Promise.resolve());
  const stop = vi.fn();
  const track = vi.fn(() => stop);
  let fixture: ComponentFixture<Usage>;
  let from: string | null;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(s: string) => el().querySelector<T>(s);
  const text = () => el().textContent!.replace(/\s+/g, ' ');

  beforeEach(() => {
    from = null;
    states.set({ '': ready([claude]) });
    rows.set([row('workstation', '', true), row('gandalf', 'connected'), row('rohan', 'offline')]);
    remaining.set(false);
    load.mockClear();
    track.mockClear();
    stop.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => from } } } },
        { provide: Quota, useValue: { view: (m: string) => () => states()[m] ?? IDLE, load, track } },
        { provide: Machines, useValue: { rows } },
        { provide: UsageDisplay, useValue: { remaining, set } },
      ],
    });
  });

  function create() {
    fixture = TestBed.createComponent(Usage);
    fixture.detectChanges();
  }

  it('lists this machine first, then the added ones with a status dot; offline ones are muted and disabled', () => {
    create();
    const chips = [...el().querySelectorAll<HTMLButtonElement>('[data-machine-chip]')];
    expect(chips.map((c) => c.textContent!.trim())).toEqual(['workstation', 'gandalf', 'rohan']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].querySelector('[data-dot]')!.className).toContain('bg-status-done');
    expect(chips[2].querySelector('[data-dot]')!.className).toContain('bg-status-idle');
    expect(chips[2].disabled).toBe(true);
  });

  it('shows a provider card with plan and a row per window: bar, figure, reset, pace', () => {
    create();
    expect(text()).toContain('Claude');
    expect(q('[data-plan]')!.textContent).toContain('Max');
    const rowsEl = el().querySelectorAll('[data-window]');
    expect(rowsEl).toHaveLength(2);
    expect(rowsEl[0].textContent).toContain('5-hour');
    expect(rowsEl[0].textContent).toContain('72% used');
    expect(rowsEl[0].textContent).toContain('Resets in 1h 5');
    expect(rowsEl[0].querySelector('[data-pace]')!.textContent).toContain('Ahead of pace');
    expect(rowsEl[0].querySelector('[data-pace]')!.getAttribute('data-trend')).toBe('lucideTrendingUp');
    expect(rowsEl[1].textContent).toContain('Almost out');
    expect(rowsEl[1].querySelector('[data-pace]')!.getAttribute('data-trend')).toBe('lucideTrendingDown');
    expect(rowsEl[0].querySelector('[data-meta]')!.firstElementChild!.textContent).toContain('Resets in');
  });

  it('switches to remaining, colors unchanged', () => {
    create();
    expect(q('hlm-switch[data-remaining-toggle]')).not.toBeNull();
    q<HTMLButtonElement>('[data-remaining-toggle] button')!.click();
    expect(set).toHaveBeenCalledWith(true);
    fixture.detectChanges();
    expect(el().querySelector('[data-window]')!.textContent).toContain('28% left');
  });

  it('says when it was read and refreshes on tap', () => {
    create();
    expect(text()).toContain('Updated 3 min ago');
    q<HTMLButtonElement>('[data-refresh]')!.click();
    expect(load).toHaveBeenCalledWith('');
  });

  it('picking an added machine tracks it and shows its numbers', () => {
    states.set({ '': ready([claude]), gandalf: ready([{ ...claude, plan: 'pro' }]) });
    create();
    [...el().querySelectorAll<HTMLButtonElement>('[data-machine-chip]')].find((c) => c.textContent!.includes('gandalf'))!.click();
    fixture.detectChanges();
    expect(track).toHaveBeenCalledWith('gandalf');
    expect(q('[data-plan]')!.textContent).toContain('Pro');
  });

  it('loading shows a skeleton', () => {
    states.set({ '': { ...IDLE, status: 'loading' } });
    create();
    expect(q('[data-loading]')).not.toBeNull();
  });

  it('not installed shows the install command with a copy button', async () => {
    states.set({ '': { ...IDLE, status: 'not-installed' } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    create();
    expect(q('[data-not-installed]')!.textContent).toContain('npm install -g quota-axi');
    expect(q('[data-not-installed] [data-icon] ng-icon')!.getAttribute('name')).toBe('lucidePackage');
    q<HTMLButtonElement>('[data-copy]')!.click();
    expect(writeText).toHaveBeenCalledWith('npm install -g quota-axi');
    vi.unstubAllGlobals();
  });

  it('an error says why and Retry reads again', () => {
    states.set({ '': { ...IDLE, status: 'error', message: 'gandalf is offline.' } });
    create();
    expect(q('[data-error]')!.textContent).toContain('gandalf is offline.');
    q<HTMLButtonElement>('[data-retry]')!.click();
    expect(load).toHaveBeenCalledWith('');
  });

  it('signed out providers are named; with none signed in the page says so', () => {
    const cursor: ProviderQuota = { provider: 'cursor', plan: null, status: 'signed-out', windows: [] };
    states.set({ '': ready([claude, cursor]) });
    create();
    expect(q('[data-signed-out]')!.textContent).toContain('Cursor');
    states.set({ '': ready([cursor]) });
    fixture.detectChanges();
    expect(q('[data-all-signed-out]')).not.toBeNull();
    expect(q('[data-all-signed-out] [data-icon] ng-icon')!.getAttribute('name')).toBe('lucideKeyRound');
  });

  it('keeps the old numbers and says the refresh failed', () => {
    states.set({ '': ready([claude], { failed: true, message: 'Reading the quota took too long.' }) });
    create();
    expect(q('[data-stale]')!.textContent).toContain('took too long');
    expect(el().querySelectorAll('[data-window]')).toHaveLength(2);
  });

  it('goes back to where it came from, and Settings stays reachable', () => {
    from = '/settings';
    create();
    expect(q('a[aria-label^="Back"]')!.getAttribute('href')).toBe('/settings');
  });

  it('releases the machine on leave', () => {
    create();
    fixture.destroy();
    expect(stop).toHaveBeenCalled();
  });
});
