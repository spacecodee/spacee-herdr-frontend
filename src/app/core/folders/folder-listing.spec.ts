import { FolderError, HOME_ARGV, LIST_LIMIT, decodeOutput, isDirArgv, listArgv, parseListing } from './folder-listing';

const nul = (...parts: string[]) => parts.join('\0') + '\0';

describe('listArgv', () => {
  it('passes the folder as one argv element and never builds a shell line from it', () => {
    const dir = `/tmp/a b/"q"/$(rm -rf ~);echo \`x\`'y'`;
    const argv = listArgv(dir);
    expect(argv[0]).toBe('find');
    expect(argv[1]).toBe(dir);
    expect(argv.filter((a) => a.includes(dir))).toEqual([dir]);
    // the one shell script is constant: it is the same for any folder
    const script = argv[argv.indexOf('-c') + 1];
    expect(script).toBe(listArgv('/other')[listArgv('/other').indexOf('-c') + 1]);
    expect(script).not.toContain('rm -rf');
  });

  it('uses only options GNU and BSD find share', () => {
    const argv = listArgv('/home/me');
    const options = argv.filter((a) => a.startsWith('-') && a !== '-c');
    expect(options).toEqual(['-mindepth', '-maxdepth', '-type', '-name', '-exec']);
    expect(argv).toContain('!');
  });

  it('checks a typed path with test -d, again as one element', () => {
    expect(isDirArgv('/a b;c')).toEqual(['test', '-d', '/a b;c']);
  });

  it('reads home with a constant script', () => {
    expect(HOME_ARGV.join(' ')).toBe('sh -c printf %s "$HOME"');
  });
});

describe('argv guard', () => {
  it.each(['-delete', 'relative/dir', '', '-x/abs', '/a\nb'])('refuses %j in both builders', (path) => {
    expect(() => listArgv(path)).toThrow(FolderError);
    expect(() => isDirArgv(path)).toThrow(FolderError);
  });
});

describe('parseListing', () => {
  it('reads GNU find output: sorted ignoring case, git marked', () => {
    const text = nul('D', '/home/me/zeta', 'G', '/home/me/Alpha', 'D', '/home/me/beta');
    const { entries, more } = parseListing(text, '/home/me');
    expect(entries.map((e) => e.name)).toEqual(['Alpha', 'beta', 'zeta']);
    expect(entries[0]).toEqual({ name: 'Alpha', path: '/home/me/Alpha', git: true });
    expect(entries[1].git).toBe(false);
    expect(more).toBe(false);
  });

  it('reads BSD find output, which doubles the slash after a trailing / and at the root', () => {
    expect(parseListing(nul('D', '/home/me//code'), '/home/me').entries[0].path).toBe('/home/me/code');
    expect(parseListing(nul('D', '//etc', 'G', '//opt'), '/').entries.map((e) => e.path)).toEqual(['/etc', '/opt']);
    expect(parseListing(nul('D', '/'), '/').entries).toEqual([]);
  });

  it('keeps names with spaces, quotes and newlines whole', () => {
    const { entries } = parseListing(nul('D', '/p/my "dir"', 'D', '/p/two\nlines'), '/p');
    expect(entries.map((e) => e.name)).toEqual(['my "dir"', 'two\nlines']);
  });

  it('drops hidden names and malformed pairs', () => {
    const { entries } = parseListing(nul('D', '/p/.cache', 'X', '/p/odd', 'D', '/p/ok') + 'D', '/p');
    expect(entries.map((e) => e.name)).toEqual(['ok']);
  });

  it('shows at most 1000 folders and says there were more', () => {
    const text = nul(...Array.from({ length: 1005 }, (_, i) => ['D', `/p/d${String(i).padStart(4, '0')}`]).flat());
    const { entries, more } = parseListing(text, '/p');
    expect(entries).toHaveLength(LIST_LIMIT);
    expect(more).toBe(true);
  });
});

describe('decodeOutput', () => {
  it('decodes base64 utf-8', () => {
    expect(decodeOutput(btoa('plain'))).toBe('plain');
    const utf8 = String.fromCharCode(...new TextEncoder().encode('café'));
    expect(decodeOutput(btoa(utf8))).toBe('café');
  });
});
