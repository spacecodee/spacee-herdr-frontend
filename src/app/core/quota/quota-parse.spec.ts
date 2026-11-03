import fixture from './quota-fixture.json';
import { parseQuota, type ProviderQuota } from './quota-parse';

const text = JSON.stringify(fixture);
const find = (providers: ProviderQuota[], name: string) => providers.find((p) => p.provider === name)!;

describe('parseQuota', () => {
  it('reads the real quota-axi output: Claude with plan and windows', () => {
    const report = parseQuota(text)!;
    expect(report.generatedAt).toBe(Date.parse(fixture.generatedAt));
    const claude = find(report.providers, 'claude');
    expect(claude).toMatchObject({ plan: 'max', status: 'ok' });
    expect(claude.windows.map((w) => [w.id, w.kind, w.label, w.percentUsed, w.pace])).toEqual([
      ['five_hour', 'session', '5-hour', 5, 'under'],
      ['seven_day', 'weekly', 'Weekly', 20, 'under'],
      ['model:fable', 'model', 'Fable weekly', 0, 'under'],
    ]);
    expect(claude.windows[0].resetsAt).toBe(Date.parse(fixture.providers[0].windows[0].resetsAt));
  });

  it('keeps on-pace and unknown pace apart', () => {
    const report = parseQuota(text)!;
    expect(find(report.providers, 'codex').windows[0].pace).toBe('on');
    expect(find(report.providers, 'copilot').windows[0].pace).toBeNull();
  });

  it('marks a provider that is not set up or signed out, with no windows', () => {
    const report = parseQuota(text)!;
    expect(find(report.providers, 'cursor')).toMatchObject({ status: 'signed-out', windows: [] });
    expect(find(report.providers, 'opencode-go')).toMatchObject({ status: 'error' });
  });

  it('tolerates missing and unknown fields', () => {
    const report = parseQuota(
      JSON.stringify({ extra: 1, providers: [{ provider: 'claude', windows: [{ id: 'x', percentRemaining: 40 }, { id: 'y' }, 7] }] }),
    )!;
    const claude = report.providers[0];
    expect(claude.plan).toBeNull();
    expect(claude.status).toBe('ok');
    expect(claude.windows).toHaveLength(1);
    expect(claude.windows[0]).toMatchObject({ percentUsed: 60, resetsAt: null, pace: null, kind: 'model' });
    expect(report.generatedAt).toBeNull();
  });

  it('clamps the percent to 0-100', () => {
    const r = parseQuota(JSON.stringify({ providers: [{ provider: 'a', windows: [{ id: 'w', percentRemaining: -5 }, { id: 'v', percentRemaining: 140 }] }] }))!;
    expect(r.providers[0].windows.map((w) => w.percentUsed)).toEqual([100, 0]);
  });

  it('ignores shell noise around the JSON', () => {
    expect(parseQuota(`Welcome\n${text}\nbye`)?.providers.length).toBeGreaterThan(5);
  });

  it('returns null for anything that is not a quota report', () => {
    expect(parseQuota('')).toBeNull();
    expect(parseQuota('not json')).toBeNull();
    expect(parseQuota('[]')).toBeNull();
    expect(parseQuota('{"providers":3}')).toBeNull();
  });
});
