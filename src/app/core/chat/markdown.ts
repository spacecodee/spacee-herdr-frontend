import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Raw HTML from a transcript is shown as text, never as markup.
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    code({ text, lang }: Tokens.Code) {
      const language = (lang ?? '').trim().split(/\s+/)[0] ?? '';
      const label = language ? `<span class="md-code-lang">${escapeHtml(language)}</span>` : '<span></span>';
      return (
        `<div class="md-code"><div class="md-code-head">${label}` +
        `<button type="button" class="md-copy" data-copy aria-label="Copy code">Copy</button></div>` +
        `<pre><code>${escapeHtml(text)}</code></pre></div>`
      );
    },
  },
});

let hooked = false;
function ensureHooks(): void {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'strong',
  'em', 'del', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span',
  'button', 'input',
];
const ALLOWED_ATTR = [
  'href', 'title', 'class', 'type', 'data-copy', 'aria-label', 'align', 'start', 'checked',
  'disabled',
];

/**
 * Markdown to sanitized HTML. Raw HTML is escaped by the renderer, and DOMPurify strips anything
 * else dangerous (scripts, event handlers, `javascript:` links). Links open in a new tab.
 */
export function renderMarkdown(source: string): string {
  ensureHooks();
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
  });
}
