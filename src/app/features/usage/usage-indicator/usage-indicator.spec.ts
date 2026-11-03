import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Quota, type MachineQuota } from '../../../core/quota/quota';
import type { ProviderQuota } from '../../../core/quota/quota-parse';
import { UsageDisplay } from '../../../core/quota/usage-display';
import { UsageIndicator } from './usage-indicator';

const win = (id: string, kind: 'session' | 'weekly', label: string, percentUsed: number) => ({
  id, kind, label, percentUsed, resetsAt: Date.now() + 3_600_000, pace: null,
});
const claude: ProviderQuota = {
  provider: 'claude', plan: 'max', status: 'ok',
  windows: [win('five_hour', 'session', '5-hour', 72), win('seven_day', 'weekly', 'Weekly', 19)],
};
const ready = (providers: ProviderQuota[]): MachineQuota => ({
  status: 'ready', report: { generatedAt: 1, providers }, at: Date.now(), refreshing: false, failed: false, message: '',
});

describe('UsageIndicator', () => {
  const state = signal<MachineQuota>({ status: 'idle', report: null, at: null, refreshing: false, failed: false, message: '' });
  const stop = vi.fn();
  const track = vi.fn(() => stop);
  const remaining = signal(false);
  let fixture: ComponentFixture<UsageIndicator>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    track.mockClear();
    stop.mockClear();
    remaining.set(false);
    state.set({ ...state(), status: 'idle', report: null });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: Quota, useValue: { view: () => state, track } },
        { provide: UsageDisplay, useValue: { remaining } },
      ],
    });
  });

  function create() {
    fixture = TestBed.createComponent(UsageIndicator);
    fixture.detectChanges();
  }

  it('shows nothing until this machine has Claude numbers', () => {
    create();
    expect(el().querySelector('[data-usage-indicator]')).toBeNull();
    state.set(ready([{ ...claude, provider: 'codex' }]));
    fixture.detectChanges();
    expect(el().querySelector('[data-usage-indicator]')).toBeNull();
  });

  it('shows the 5-hour and weekly bars, linking to Usage with a spoken summary', () => {
    state.set(ready([claude]));
    create();
    const link = el().querySelector<HTMLAnchorElement>('[data-usage-indicator]')!;
    expect(link.getAttribute('href')).toContain('/usage');
    expect(link.getAttribute('aria-label')).toBe('Usage. Claude 5-hour 72% used, Weekly 19% used');
    expect(el().querySelectorAll('app-quota-bar')).toHaveLength(2);
  });

  it('follows the remaining toggle in its words and stays colored by used', () => {
    state.set(ready([claude]));
    remaining.set(true);
    create();
    expect(el().querySelector('a')!.getAttribute('aria-label')).toContain('28% left');
  });

  it('keeps this machine fresh while it lives', () => {
    create();
    expect(track).toHaveBeenCalledWith('');
    fixture.destroy();
    expect(stop).toHaveBeenCalled();
  });
});
