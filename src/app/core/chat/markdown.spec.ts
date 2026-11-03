import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings, lists, tables and inline code', () => {
    const html = renderMarkdown('# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n`code`');
    expect(html).toContain('<h1');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code>code</code>');
  });

  it('fenced code gets a copy button and keeps the text escaped', () => {
    const html = renderMarkdown('```ts\nconst a = "<b>";\n```');
    expect(html).toContain('data-copy');
    expect(html).toContain('md-code-lang');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('strips script tags and shows raw html as text', () => {
    const html = renderMarkdown('hi <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<[^>]*onerror/i);
  });

  it('removes javascript: links', () => {
    const html = renderMarkdown('[x](javascript:alert(1)) and [y](JaVaScRiPt:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('links open in a new tab with noopener', () => {
    const html = renderMarkdown('[site](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('noopener');
  });

  it('drops event handler attributes from allowed tags', () => {
    const html = renderMarkdown('<a href="https://x.dev" onclick="evil()">k</a>');
    expect(html).not.toMatch(/<a[^>]*onclick/);
  });
});
