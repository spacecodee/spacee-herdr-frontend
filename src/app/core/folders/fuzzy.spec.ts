import { fuzzyMatch, highlight } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches a subsequence, ignoring case, and reports where', () => {
    expect(fuzzyMatch('sh', 'spacee-herdr')?.indices).toEqual([0, 7]);
    expect(fuzzyMatch('DEV', 'Development')?.indices).toEqual([0, 1, 2]);
  });

  it('does not match when a character is missing or out of order', () => {
    expect(fuzzyMatch('xyz', 'Development')).toBeNull();
    expect(fuzzyMatch('ved', 'Development')).toBeNull();
  });

  it('ranks a contiguous match ahead of a scattered one, and an earlier one first', () => {
    const contiguous = fuzzyMatch('dev', 'my-dev')!;
    const scattered = fuzzyMatch('dev', 'dxexv')!;
    expect(contiguous.rank).toBeLessThan(scattered.rank);
    expect(fuzzyMatch('dev', 'dev-tools')!.rank).toBeLessThan(contiguous.rank);
  });

  it('matches everything when the query is empty', () => {
    expect(fuzzyMatch('', 'anything')).toEqual({ rank: 0, indices: [] });
  });
});

describe('highlight', () => {
  it('splits the text into matched and plain runs', () => {
    expect(highlight('Development', [0, 1, 2])).toEqual([
      { text: 'Dev', on: true },
      { text: 'elopment', on: false },
    ]);
    expect(highlight('abc', [])).toEqual([{ text: 'abc', on: false }]);
    expect(highlight('abc', [1])).toEqual([
      { text: 'a', on: false },
      { text: 'b', on: true },
      { text: 'c', on: false },
    ]);
  });
});
