import { isSafePath, normalizePath } from '../folders/folder-path';

export interface PathMatch {
  start: number;
  end: number;
}

/**
 * A path with at least one `/` and an extension (with a letter in it, so `1.2/3.4` is not one),
 * optionally followed by `:line` or `:line:col`. It cannot start inside a word, a URL (`//`, `:`),
 * `~` or another path, so `https://x.dev/a/b.html` and `~/x.sh` are left alone.
 */
const PATH =
  /(?<![\w./:~@+-])(?:\.{1,2}\/|\/)?(?:[\w@+-][\w.@+-]*\/)+[\w@+-][\w.@+-]*\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+(?::\d+(?::\d+)?)?/g;

export function findFilePaths(text: string): PathMatch[] {
  return [...text.matchAll(PATH)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/** The absolute path a link points at: `:line` dropped, a relative path resolved against the project folder. */
export function resolveFilePath(link: string, folder: string): string | null {
  const path = link.replace(/:\d+(?::\d+)?$/, '');
  if (!isSafePath(path)) return null;
  if (path.startsWith('/')) return normalizePath(path);
  if (!folder.startsWith('/')) return null;
  return normalizePath(`${folder}/${path}`);
}

/**
 * Turns the paths in rendered (already sanitized) HTML into links the app opens in the file viewer.
 * Only text nodes change, and the link is built with DOM calls, so text never becomes markup. Code
 * blocks and existing links stay as they are.
 */
export function linkFilePaths(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.parentElement?.closest('a, pre'))) nodes.push(n as Text);
  }
  for (const node of nodes) {
    const text = node.data;
    const found = findFilePaths(text);
    if (found.length === 0) continue;
    const parts = document.createDocumentFragment();
    let at = 0;
    for (const { start, end } of found) {
      if (start > at) parts.append(text.slice(at, start));
      const a = document.createElement('a');
      a.setAttribute('href', '#');
      a.className = 'file-link';
      a.setAttribute('data-file', text.slice(start, end));
      a.textContent = text.slice(start, end);
      parts.append(a);
      at = end;
    }
    if (at < text.length) parts.append(text.slice(at));
    node.replaceWith(parts);
  }
  return template.innerHTML;
}
