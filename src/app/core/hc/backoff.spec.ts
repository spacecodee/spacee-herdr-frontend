import { backoffDelay } from './backoff';

describe('backoffDelay', () => {
  it('doubles from 0.5 s and caps at 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(backoffDelay)).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000, 10000,
    ]);
  });
});
