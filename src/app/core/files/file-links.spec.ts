import { findFilePaths, linkFilePaths, resolveFilePath } from './file-links';

const paths = (text: string) => findFilePaths(text).map((m) => text.slice(m.start, m.end));

describe('findFilePaths', () => {
  it('finds absolute and relative paths that have a slash and an extension', () => {
    expect(paths('I changed src/app/features/settings/settings.ts and /home/me/x/y.json today')).toEqual([
      'src/app/features/settings/settings.ts',
      '/home/me/x/y.json',
    ]);
  });

  it('leaves out the dot or comma that ends a sentence, and keeps a :line suffix in the link', () => {
    expect(paths('See docs/a.md. Also docs/b.md, then src/c.ts:42.')).toEqual(['docs/a.md', 'docs/b.md', 'src/c.ts:42']);
  });

  it('ignores URLs, words with a slash, versions and bare file names', () => {
    expect(paths('Open https://example.com/a/b.html or and/or 1.2/3.4 or settings.ts or ./x')).toEqual([]);
    expect(paths('see ~/x.sh')).toEqual([]);
  });

  it('accepts ./ and ../ relative paths', () => {
    expect(paths('edit ./src/a.ts and ../b/c.css')).toEqual(['./src/a.ts', '../b/c.css']);
  });

  it('sees a path inside quotes, parentheses and backticks', () => {
    expect(paths('(`src/a.ts`) "src/b.ts" \'src/c.ts\'')).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });
});

describe('resolveFilePath', () => {
  it('keeps an absolute path and drops :line', () => {
    expect(resolveFilePath('/a/b.ts:12', '/proj')).toBe('/a/b.ts');
  });

  it('resolves a relative one against the project folder', () => {
    expect(resolveFilePath('src/a.ts', '/home/me/proj')).toBe('/home/me/proj/src/a.ts');
    expect(resolveFilePath('./src/a.ts:3:4', '/home/me/proj/')).toBe('/home/me/proj/src/a.ts');
    expect(resolveFilePath('../x/a.ts', '/home/me/proj')).toBe('/home/me/x/a.ts');
  });

  it('is null without a folder, or for an unsafe path', () => {
    expect(resolveFilePath('src/a.ts', '')).toBeNull();
    expect(resolveFilePath('src/a\u0000.ts', '/p')).toBeNull();
  });
});

describe('linkFilePaths', () => {
  const html = (s: string) => linkFilePaths(s);

  it('wraps a path in plain text and in inline code as a link carrying the original text', () => {
    expect(html('<p>I changed src/a.ts and <code>src/b.ts</code></p>')).toBe(
      '<p>I changed <a href="#" class="file-link" data-file="src/a.ts">src/a.ts</a> and ' +
        '<code><a href="#" class="file-link" data-file="src/b.ts">src/b.ts</a></code></p>',
    );
  });

  it('leaves code blocks and existing links alone', () => {
    const input = '<pre><code>src/a.ts</code></pre><p><a href="https://x.dev/a/b.ts">a/b.ts</a></p>';
    expect(html(input)).toBe(input);
  });

  it('never turns text into markup', () => {
    const out = html('<p>x &lt;img src=x onerror=alert(1)&gt; a/b.ts</p>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
  });
});
