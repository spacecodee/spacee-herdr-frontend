export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment';

export interface Token {
  kind: TokenKind;
  text: string;
}

/** `slash`: line and block comments; `block`: block comments only (CSS); `hash`: `#` lines; `none`: no comments. */
export type CommentStyle = 'slash' | 'block' | 'hash' | 'none';

export interface Language {
  label: string;
  comment: CommentStyle;
}

interface Rules extends Language {
  strings: boolean;
  keywords: boolean;
}

/*
 * Why a tokenizer of our own: the viewer only needs three colors (keyword, string, comment), which a
 * single left-to-right scan gives for every C-like, script and config language. Prism or highlight.js
 * add tens of kB and per-language grammars for a result the design does not use. It lives in the
 * viewer's lazy chunk and nothing else imports it.
 */
const code = (label: string, comment: CommentStyle): Rules => ({ label, comment, strings: true, keywords: true });
const data = (label: string, comment: CommentStyle): Rules => ({ label, comment, strings: true, keywords: false });
const text = (label: string): Rules => ({ label, comment: 'none', strings: false, keywords: false });

const BY_EXT: Record<string, Rules> = {
  ts: code('TypeScript', 'slash'), tsx: code('TypeScript', 'slash'), mts: code('TypeScript', 'slash'), cts: code('TypeScript', 'slash'),
  js: code('JavaScript', 'slash'), jsx: code('JavaScript', 'slash'), mjs: code('JavaScript', 'slash'), cjs: code('JavaScript', 'slash'),
  py: code('Python', 'hash'), rb: code('Ruby', 'hash'),
  sh: code('Shell', 'hash'), bash: code('Shell', 'hash'), zsh: code('Shell', 'hash'),
  go: code('Go', 'slash'), rs: code('Rust', 'slash'), java: code('Java', 'slash'), kt: code('Kotlin', 'slash'),
  c: code('C', 'slash'), h: code('C', 'slash'), cpp: code('C++', 'slash'), cc: code('C++', 'slash'), hpp: code('C++', 'slash'),
  cs: code('C#', 'slash'), swift: code('Swift', 'slash'), php: code('PHP', 'slash'),
  css: data('CSS', 'block'), scss: data('SCSS', 'slash'),
  json: data('JSON', 'none'), jsonc: data('JSON', 'slash'),
  yaml: data('YAML', 'hash'), yml: data('YAML', 'hash'), toml: data('TOML', 'hash'),
  html: text('HTML'), htm: text('HTML'), xml: text('XML'), svg: text('SVG'), md: text('Markdown'),
};
const BY_NAME: Record<string, Rules> = { Makefile: code('Makefile', 'hash'), Dockerfile: code('Dockerfile', 'hash') };

const rulesOf = (path: string): Rules => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf('.');
  return (dot > 0 && BY_EXT[name.slice(dot + 1).toLowerCase()]) || text('Text');
};

export function languageOf(path: string): Language {
  const { label, comment } = rulesOf(path);
  return { label, comment };
}

const KEYWORDS = new Set(
  (
    'abstract and as async await break case catch class const continue declare def default defer del delete do elif else enum ' +
    'except export extends false final finally fn for from func function go if impl implements import in instanceof interface is ' +
    'lambda let loop match mod mut namespace new nil none not null of or override package pass private protected pub public ' +
    'raise readonly return self static struct super switch then this throw trait true try type typeof union unsafe use using var ' +
    'void while with yield'
  ).split(' '),
);

const WORD = /[A-Za-z_$][\w$]*/y;

/** Splits `text` into lines of tokens. Every character of `text` ends up in exactly one token. */
export function highlight(source: string, path: string): Token[][] {
  const rules = rulesOf(path);
  const slash = rules.comment === 'slash';
  const block = slash || rules.comment === 'block';
  const flat: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = flat[flat.length - 1];
    if (last && last.kind === kind) last.text += text;
    else flat.push({ kind, text });
  };
  const until = (from: number, end: string): number => {
    const at = source.indexOf(end, from);
    return at < 0 ? source.length : at + end.length;
  };
  const lineEnd = (from: number): number => {
    const at = source.indexOf('\n', from);
    return at < 0 ? source.length : at;
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (block && c === '/' && source[i + 1] === '*') {
      const end = until(i + 2, '*/');
      push('comment', source.slice(i, end));
      i = end;
    } else if ((slash && c === '/' && source[i + 1] === '/') || (rules.comment === 'hash' && c === '#')) {
      const end = lineEnd(i);
      push('comment', source.slice(i, end));
      i = end;
    } else if (rules.strings && (c === '"' || c === "'" || c === '`')) {
      const triple = source.startsWith(c.repeat(3), i) && rules.comment === 'hash';
      let end: number;
      if (triple) end = until(i + 3, c.repeat(3));
      else if (c === '`') end = until(i + 1, '`');
      else {
        // A quote ends at the same quote, unescaped, or at the end of the line.
        const stop = lineEnd(i);
        end = i + 1;
        while (end < stop && source[end] !== c) end += source[end] === '\\' ? 2 : 1;
        end = Math.min(end < stop ? end + 1 : stop, source.length);
      }
      push('string', source.slice(i, end));
      i = end;
    } else if (rules.keywords) {
      WORD.lastIndex = i;
      const word = WORD.exec(source);
      if (word) {
        push(KEYWORDS.has(word[0]) ? 'keyword' : 'plain', word[0]);
        i += word[0].length;
      } else {
        push('plain', c);
        i++;
      }
    } else {
      // Plain text: skip to the next character that could start something.
      let end = i + 1;
      while (end < source.length && !'/#"\'`'.includes(source[end])) end++;
      push('plain', source.slice(i, end));
      i = end;
    }
  }

  const lines: Token[][] = [[]];
  for (const token of flat) {
    const parts = token.text.split('\n');
    parts.forEach((part, n) => {
      if (n > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1].push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
