import { describe, expect, it } from 'vitest';
import { toolKind } from './tool-kind';

describe('toolKind', () => {
  it.each([
    ['Bash', 'shell'],
    ['shell', 'shell'],
    ['Read', 'read'],
    ['Edit', 'edit'],
    ['write_file', 'edit'],
    ['Grep', 'search'],
    ['WebFetch', 'web'],
    ['Task', 'other'],
    ['', 'other'],
  ])('%s -> %s', (name, kind) => expect(toolKind(name)).toBe(kind));
});
