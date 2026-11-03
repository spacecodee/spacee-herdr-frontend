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
  it('counts every terminal, blocked and working apart', () => {
    expect(summarize([t('blocked'), t('working'), t('blocked'), t('idle')])).toEqual({
      total: 4,
      blocked: 2,
      working: 1,
    });
  });

  it('reports working alone when nothing is blocked', () => {
    expect(summarize([t('working'), t(), t('done')])).toEqual({ total: 3, blocked: 0, working: 1 });
  });

  it('has nothing to call out when nothing needs attention', () => {
    expect(summarize([t('idle'), t('done')])).toEqual({ total: 2, blocked: 0, working: 0 });
    expect(summarize([])).toEqual({ total: 0, blocked: 0, working: 0 });
  });
});
