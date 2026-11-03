import { barOf, claudeFigures, planLabel, providerAgent, providerName, shownProviders } from './quota-view';
import type { ProviderQuota, QuotaWindow } from './quota-parse';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-03T12:00:00Z');
const win = (over: Partial<QuotaWindow> = {}): QuotaWindow => ({
  id: 'five_hour',
  kind: 'session',
  label: '5-hour',
  resetsAt: NOW + 1 * HOUR,
  percentUsed: 72,
  pace: 'ahead',
  ...over,
});
const provider = (over: Partial<ProviderQuota> = {}): ProviderQuota => ({ provider: 'claude', plan: 'max', status: 'ok', windows: [win()], ...over });

describe('barOf', () => {
  it('colors from the used share and words it as used or remaining', () => {
    const used = barOf(win(), NOW, false);
    expect(used).toMatchObject({ used: 72, tier: 'amber', figure: '72% used', note: '' });
    expect(used.tick).toBeCloseTo(80);
    expect(used.pace).toBe('Ahead of pace');
    expect(used.paceIcon).toBe('lucideTrendingUp');
    expect(barOf(win({ pace: 'under' }), NOW, false).paceIcon).toBe('lucideTrendingDown');
    expect(barOf(win({ pace: 'on' }), NOW, false).paceIcon).toBe('lucideMinus');
    expect(barOf(win({ pace: null }), NOW, false).paceIcon).toBe('');
    expect(used.reset).toBe('Resets in 1h');
    const left = barOf(win({ percentUsed: 85 }), NOW, true);
    expect(left).toMatchObject({ used: 85, tier: 'low', figure: '15% left', note: 'Running low' });
    expect(barOf(win({ percentUsed: 95 }), NOW, false)).toMatchObject({ tier: 'blocked', note: 'Almost out' });
  });

  it('has no tick for a window of unknown length', () => {
    expect(barOf(win({ kind: 'monthly', id: 'chat' }), NOW, false).tick).toBeNull();
  });
});

describe('claudeFigures', () => {
  it('picks the 5-hour and weekly windows of Claude only', () => {
    const f = claudeFigures([provider({ provider: 'codex' }), provider({ windows: [win({ id: 'seven_day', kind: 'weekly' }), win()] })]);
    expect([f.session?.id, f.weekly?.id]).toEqual(['five_hour', 'seven_day']);
    expect(claudeFigures([provider({ provider: 'codex' })])).toEqual({ session: null, weekly: null });
  });
});

describe('planLabel', () => {
  it('capitalizes the first letter and keeps the rest', () => {
    expect(planLabel('max')).toBe('Max');
    expect(planLabel('max 20x')).toBe('Max 20x');
    expect(planLabel(null)).toBeNull();
  });
});

describe('providers', () => {
  it('names and marks', () => {
    expect(providerName('claude')).toBe('Claude');
    expect(providerName('agy')).toBe('Antigravity');
    expect(providerName('some-new')).toBe('Some-new');
    expect(providerAgent('claude')).toBe('claude');
    expect(providerAgent('agy')).toBe('antigravity');
    expect(providerAgent('deepseek')).toBe('generic');
  });

  it('shows providers with numbers or an error, and counts the signed out ones apart', () => {
    const out = shownProviders([
      provider(),
      provider({ provider: 'cursor', status: 'signed-out', windows: [] }),
      provider({ provider: 'opencode-go', status: 'error', windows: [] }),
      provider({ provider: 'empty', windows: [] }),
    ]);
    expect(out.cards.map((p) => p.provider)).toEqual(['claude', 'opencode-go']);
    expect(out.signedOut).toEqual(['Cursor']);
  });
});
