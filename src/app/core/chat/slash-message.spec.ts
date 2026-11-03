import { describe, expect, it } from 'vitest';
import { slashCommandLine } from './slash-message';

describe('slashCommandLine', () => {
  it.each(['/clear', '/model opus', '/compact', '/foo:bar-baz arg', '  /help  ', '/clear\n'])('%j is a command', (text) => {
    expect(slashCommandLine(text)).toBe(text.trim());
  });

  it.each([
    'hello',
    '/',
    '/Clear',
    '/1',
    '/home/user/file.ts',
    '/clear\nthen run tests',
    'please /clear',
    '',
  ])('%j is not a command', (text) => {
    expect(slashCommandLine(text)).toBeNull();
  });
});
