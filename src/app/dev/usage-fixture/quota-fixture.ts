import { signal } from '@angular/core';
import { Quota, type MachineQuota } from '../../core/quota/quota';
import type { ProviderQuota, QuotaWindow } from '../../core/quota/quota-parse';

const H = 3_600_000;
const win = (id: string, kind: QuotaWindow['kind'], label: string, percentUsed: number, hoursLeft: number, pace: QuotaWindow['pace']): QuotaWindow => ({
  id, kind, label, percentUsed, pace, resetsAt: Date.now() + hoursLeft * H,
});

const claude = (session: number, weekly: number): ProviderQuota => ({
  provider: 'claude',
  plan: 'max',
  status: 'ok',
  windows: [
    win('five_hour', 'session', '5-hour', session, 2.2, session > 55 ? 'ahead' : 'under'),
    win('seven_day', 'weekly', 'Weekly', weekly, 96, 'under'),
    win('model:fable', 'model', 'Fable weekly', 8, 96, 'under'),
  ],
});
const codex: ProviderQuota = {
  provider: 'codex',
  plan: 'plus',
  status: 'ok',
  windows: [win('five_hour', 'session', '5-hour', 0, 4.8, 'on'), win('weekly', 'weekly', 'Weekly', 67, 20, 'under')],
};
const cursor: ProviderQuota = { provider: 'cursor', plan: null, status: 'signed-out', windows: [] };

const ready = (providers: ProviderQuota[], extra: Partial<MachineQuota> = {}): MachineQuota => ({
  status: 'ready', report: { generatedAt: Date.now(), providers }, at: Date.now() - 3 * 60_000, refreshing: false, failed: false, message: '', ...extra,
});
const base: MachineQuota = { status: 'idle', report: null, at: null, refreshing: false, failed: false, message: '' };

/** Canned quota for the dev screens (`?s=`): ready (default), low, blocked, loading, not-installed, error, signed-out, stale. */
export function quotaScenario(name: string | null): MachineQuota {
  switch (name) {
    case 'low': return ready([claude(84, 61), codex, cursor]);
    case 'blocked': return ready([claude(95, 93), codex, cursor]);
    case 'loading': return { ...base, status: 'loading' };
    case 'not-installed': return { ...base, status: 'not-installed' };
    case 'error': return { ...base, status: 'error', message: 'Reading the quota took too long.' };
    case 'signed-out': return ready([cursor, { provider: 'grok', plan: null, status: 'signed-out', windows: [] }]);
    case 'stale': return ready([claude(72, 19), codex], { failed: true, message: 'Reading the quota took too long.' });
    default: return ready([claude(72, 19), codex, cursor]);
  }
}

export function fixtureQuota(name: string | null): Quota {
  const state = signal(quotaScenario(name));
  return { view: () => state, load: async () => undefined, track: () => () => undefined } as unknown as Quota;
}
