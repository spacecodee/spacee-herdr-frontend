import { backTarget } from './back-target';

describe('backTarget', () => {
  it('keeps a safe in-app path, query included', () => {
    expect(backTarget('/t/rohan%2Ft7')).toBe('/t/rohan%2Ft7');
    expect(backTarget('/?x=1')).toBe('/?x=1');
  });

  it.each([
    null,
    '',
    'https://x',
    '//x',
    '/\\x',
    'javascript:alert(1)',
    't/abc',
    '/settings',
    '/settings?from=/',
    '/settings/x',
    '/a\nb',
  ])('falls back to / for %j', (from) => {
    expect(backTarget(from)).toBe('/');
  });
});
