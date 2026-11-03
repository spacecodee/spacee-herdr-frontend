import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEW_MODE_KEY, ViewModes, defaultMode } from './view-mode';

describe('defaultMode', () => {
  it('chat for agents, terminal for plain shells', () => {
    expect(defaultMode('claude')).toBe('chat');
    expect(defaultMode('pi')).toBe('chat');
    expect(defaultMode(undefined)).toBe('terminal');
    expect(defaultMode('')).toBe('terminal');
    expect(defaultMode('shell')).toBe('terminal');
  });
});

function stubStorage(initial?: string): Storage {
  const data = new Map<string, string>(initial === undefined ? [] : [[VIEW_MODE_KEY, initial]]);
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage;
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('ViewModes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('persists per terminal address', () => {
    const storage = stubStorage();
    const modes = TestBed.inject(ViewModes);
    modes.set('rohan/t7', 'terminal');
    expect(modes.get('rohan/t7')).toBe('terminal');
    expect(modes.get('other')).toBeUndefined();
    expect(JSON.parse(storage.getItem(VIEW_MODE_KEY) ?? '{}')).toEqual({ 'rohan/t7': 'terminal' });
  });

  it('reads a saved choice and drops invalid values', () => {
    stubStorage(JSON.stringify({ a: 'chat', b: 'nope' }));
    const modes = TestBed.inject(ViewModes);
    expect(modes.get('a')).toBe('chat');
    expect(modes.get('b')).toBeUndefined();
  });

  it('survives corrupt storage', () => {
    stubStorage('{oops');
    expect(TestBed.inject(ViewModes).get('a')).toBeUndefined();
  });
});
