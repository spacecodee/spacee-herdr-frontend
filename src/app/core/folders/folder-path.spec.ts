import { crumbs, isSafePath, joinPath, looksLikePath, middleTruncate, normalizePath, parentOf, resolveTyped, tildePath } from './folder-path';

describe('folder paths', () => {
  const home = '/home/me';

  it('rejects NUL, newline and other control characters, and empty or huge paths', () => {
    expect(isSafePath('/home/me')).toBe(true);
    expect(isSafePath('')).toBe(false);
    expect(isSafePath('/a\u0000b')).toBe(false);
    expect(isSafePath('/a\nb')).toBe(false);
    expect(isSafePath('/a\tb')).toBe(false);
    expect(isSafePath('/' + 'a'.repeat(4096))).toBe(false);
  });

  it('keeps spaces, quotes and shell signs: they are just characters in one argv element', () => {
    expect(isSafePath(`/tmp/a b/"q"/$(x);y`)).toBe(true);
  });

  it('normalizes dots and double slashes', () => {
    expect(normalizePath('/a//b/./c/../d/')).toBe('/a/b/d');
    expect(normalizePath('/..')).toBe('/');
    expect(parentOf('/home/me')).toBe('/home');
    expect(parentOf('/home')).toBe('/');
    expect(joinPath('/', 'etc')).toBe('/etc');
  });

  it('resolves typed paths from ~ and /, and refuses the rest', () => {
    expect(resolveTyped('~', home)).toBe('/home/me');
    expect(resolveTyped(' ~/Dev/x ', home)).toBe('/home/me/Dev/x');
    expect(resolveTyped('/var/log', home)).toBe('/var/log');
    expect(resolveTyped('~/../you', home)).toBe('/home/you');
    expect(resolveTyped('~root', home)).toBeNull();
    expect(resolveTyped('code', home)).toBeNull();
    expect(resolveTyped('/a\nb', home)).toBeNull();
  });

  it('tells a path from filter text', () => {
    expect(looksLikePath('~/Dev')).toBe(true);
    expect(looksLikePath('/etc')).toBe(true);
    expect(looksLikePath('dev')).toBe(false);
  });

  it('builds breadcrumbs from ~ inside home, from / outside it', () => {
    expect(crumbs('/home/me/code/app', home)).toEqual([
      { label: '~', path: '/home/me' },
      { label: 'code', path: '/home/me/code' },
      { label: 'app', path: '/home/me/code/app' },
    ]);
    expect(crumbs('/home/me', home)).toEqual([{ label: '~', path: '/home/me' }]);
    expect(crumbs('/var/log', home)).toEqual([
      { label: '/', path: '/' },
      { label: 'var', path: '/var' },
      { label: 'log', path: '/var/log' },
    ]);
    expect(crumbs('/home/mery', home)[0].label).toBe('/');
  });

  it('shows home as ~ and truncates the middle of long paths', () => {
    expect(tildePath('/home/me/code', home)).toBe('~/code');
    expect(tildePath('/home/me', home)).toBe('~');
    expect(tildePath('/home/mery', home)).toBe('/home/mery');
    const long = '~/Development/fullstack/spacee-herdr-app/spacee-herdr-frontend';
    const short = middleTruncate(long, 34);
    expect(short).toHaveLength(34);
    expect(short).toContain('…');
    expect(short.endsWith('herdr-frontend')).toBe(true);
    expect(middleTruncate('~/code', 34)).toBe('~/code');
  });
});
