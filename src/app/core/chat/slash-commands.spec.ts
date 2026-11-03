import { describe, expect, it } from 'vitest';
import { slashCommands } from './slash-commands';

describe('slashCommands', () => {
  it('knows each agent kind', () => {
    expect(slashCommands('claude')).toContain('/compact');
    expect(slashCommands('Claude Code')).toContain('/compact');
    expect(slashCommands('pi')).toContain('/new');
    expect(slashCommands('opencode')).toContain('/sessions');
  });
  it('falls back to a common list', () => {
    expect(slashCommands('mystery')).toEqual(['/help', '/clear', '/model']);
    expect(slashCommands(undefined)).toEqual(['/help', '/clear', '/model']);
  });
  it('every command starts with a slash', () => {
    for (const a of ['claude', 'pi', 'codex', 'opencode', 'agy', 'x'])
      expect(slashCommands(a).every((c) => c.startsWith('/'))).toBe(true);
  });
});
