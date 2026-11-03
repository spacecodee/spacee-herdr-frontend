import { summarize } from './group-summary';
import type { Terminal } from './types';

const t = (state?: string): Terminal =>
  ({
    address: 'a',
    labels: {},
    argv: [],
    cwd: '/',
    state: 'live',
    created_ms: 1,
    screen: 'exact',
    cols: 1,
    rows: 1,
    status: state ? { state } : undefined,
  }) as Terminal;

describe('summarize', () => {
  it('counts every terminal and calls out blocked first', () => {
    expect(summarize([t('blocked'), t('working'), t('blocked'), t('idle')])).toEqual({
      total: 4,
      kind: 'blocked',
      count: 2,
    });
  });

  it('falls back to working when nothing is blocked', () => {
    expect(summarize([t('working'), t(), t('done')])).toEqual({
      total: 3,
      kind: 'working',
      count: 1,
    });
  });

  it('has no headline when nothing needs attention', () => {
    expect(summarize([t('idle'), t('done')])).toEqual({ total: 2, kind: null, count: 0 });
    expect(summarize([])).toEqual({ total: 0, kind: null, count: 0 });
  });
});
