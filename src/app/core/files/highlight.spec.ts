import { highlight, languageOf } from './highlight';

const flat = (text: string, path: string) => highlight(text, path).map((line) => line.map((t) => `${t.kind}:${t.text}`));

describe('languageOf', () => {
  it('names the language and its comment style from the extension', () => {
    expect(languageOf('/a/b.ts')).toEqual({ label: 'TypeScript', comment: 'slash' });
    expect(languageOf('/a/b.py')).toEqual({ label: 'Python', comment: 'hash' });
    expect(languageOf('/a/Makefile').comment).toBe('hash');
    expect(languageOf('/a/data.json')).toEqual({ label: 'JSON', comment: 'none' });
    expect(languageOf('/a/notes.xyz')).toEqual({ label: 'Text', comment: 'none' });
  });
});

describe('highlight', () => {
  it('marks keywords, strings and comments and keeps every character', () => {
    expect(flat("const KEY = 'herdr'; // size", '/a.ts')).toEqual([
      ['keyword:const', 'plain: KEY = ', "string:'herdr'", 'plain:; ', 'comment:// size'],
    ]);
  });

  it('does not take part of a word for a keyword', () => {
    expect(flat('constant = classy', '/a.ts')).toEqual([['plain:constant = classy']]);
  });

  it('keeps a comment marker inside a string as string', () => {
    expect(highlight('x = "a // b"', '/a.ts')[0].map((t) => t.kind)).toEqual(['plain', 'string']);
  });

  it('splits multi-line block comments and template strings into lines', () => {
    expect(flat('/* a\n b */ x\n`t\nu`', '/a.ts')).toEqual([
      ['comment:/* a'],
      ['comment: b */', 'plain: x'],
      ['string:`t'],
      ['string:u`'],
    ]);
  });

  it('uses # comments for scripts and never for TypeScript', () => {
    expect(flat('echo a # note', '/a.sh')).toEqual([['plain:echo a ', 'comment:# note']]);
    expect(flat('a # b', '/a.ts')).toEqual([['plain:a # b']]);
  });

  it('shows an unterminated string up to the end of its line', () => {
    expect(flat("it's here\nnext", '/a.ts')).toEqual([["plain:it", "string:'s here"], ['plain:next']]);
  });

  it('returns one empty line for an empty file and none of the markup is touched', () => {
    expect(highlight('', '/a.ts')).toEqual([[]]);
    expect(flat('<b>x</b>', '/a.html')).toEqual([['plain:<b>x</b>']]);
  });

  it('copes with a 1 MB single line', () => {
    const line = 'a '.repeat(500_000);
    expect(highlight(line, '/a.ts')).toHaveLength(1);
  });
});
