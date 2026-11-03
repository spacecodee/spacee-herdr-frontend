import {
  countdown,
  formatCode,
  lastSeenLabel,
  nameProblem,
  normalizeCode,
  platformMark,
  signedInLabel,
} from './device-format';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('normalizeCode', () => {
  it.each([
    ['K7M2QX', 'K7M2QX'],
    ['k7m 2qx', 'K7M2QX'],
    [' K7M-2QX \n', 'K7M2QX'],
    ['K7M2QXZZ', 'K7M2QX'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeCode(input)).toBe(expected);
  });
});

describe('formatCode', () => {
  it('groups the code in threes', () => {
    expect(formatCode('K7M2QX')).toBe('K7M 2QX');
  });
});

describe('lastSeenLabel', () => {
  it('is "Active now" under two minutes', () => {
    expect(lastSeenLabel(ago(119_000), NOW)).toBe('Active now');
  });
  it.each([
    [2 * 60_000, '2m ago'],
    [59 * 60_000, '59m ago'],
    [2 * 3_600_000, '2h ago'],
    [23 * 3_600_000, '23h ago'],
    [3 * 86_400_000, '3d ago'],
  ])('%i ms ago -> %s', (diff, label) => {
    expect(lastSeenLabel(ago(diff), NOW)).toBe(label);
  });
  it('falls back to a date after 30 days, and is empty for a bad value', () => {
    expect(lastSeenLabel(ago(40 * 86_400_000), NOW)).toBe('24 Sep');
    expect(lastSeenLabel('nope', NOW)).toBe('');
  });
});

describe('signedInLabel', () => {
  it('names the day and month', () => {
    expect(signedInLabel('2026-10-20T09:00:00Z')).toBe('signed in 20 Oct');
  });
  it('is empty for a bad value', () => {
    expect(signedInLabel('x')).toBe('');
  });
});

describe('countdown', () => {
  it.each([
    [300_000, '5:00'],
    [299_001, '5:00'],
    [61_000, '1:01'],
    [9_000, '0:09'],
    [0, '0:00'],
    [-5, '0:00'],
  ])('%i ms -> %s', (ms, text) => {
    expect(countdown(ms)).toBe(text);
  });
});

describe('nameProblem', () => {
  it('accepts 1-40 characters after trimming', () => {
    expect(nameProblem('iPhone')).toBe('');
    expect(nameProblem('x'.repeat(40))).toBe('');
  });
  it('rejects empty and too long names', () => {
    expect(nameProblem('   ')).toBe('Enter a name');
    expect(nameProblem('x'.repeat(41))).toBe('Use 40 characters or fewer');
  });
});

describe('platformMark', () => {
  it.each([
    ['ios', 'apple'],
    ['ipad', 'apple'],
    ['mac', 'apple'],
    ['android', 'android'],
    ['other', 'monitor'],
  ] as const)('%s -> %s', (platform, mark) => {
    expect(platformMark(platform)).toBe(mark);
  });
});
