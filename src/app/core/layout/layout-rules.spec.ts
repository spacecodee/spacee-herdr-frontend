import type { Location, Space } from '../hc/spaces';
import { LAUNCH_OPTIONS, closeCopy, closeTarget, folderError, homeFolder, nameError, spaceTerminals } from './layout-rules';

const loc = (extra: Partial<Location> = {}): Location => ({
  spaceId: 's1',
  spaceName: 'Work',
  spaceIndex: 1,
  spaceCount: 2,
  tabId: 'tb1',
  tabName: 'Claude',
  tabIndex: 1,
  tabCount: 2,
  paneId: 'p1',
  paneCount: 2,
  ...extra,
});

describe('LAUNCH_OPTIONS', () => {
  it('starts with the shell, which sends no argv, then the five agents', () => {
    expect(LAUNCH_OPTIONS.map((o) => [o.label, o.argv])).toEqual([
      ['Shell', undefined],
      ['Claude Code', ['claude']],
      ['pi', ['pi']],
      ['Codex', ['codex']],
      ['opencode', ['opencode']],
      ['Antigravity', ['agy']],
    ]);
  });
});

describe('nameError', () => {
  it('requires a name', () => {
    expect(nameError('')).toBe('Enter a name.');
    expect(nameError('   ')).toBe('Enter a name.');
    expect(nameError(' Work ')).toBe('');
  });
});

describe('folderError', () => {
  it('requires an absolute path', () => {
    expect(folderError('')).toBe('Enter an absolute folder, like /home/me/code.');
    expect(folderError('code')).toBe('Enter an absolute folder, like /home/me/code.');
    expect(folderError('~/code')).toBe('Enter an absolute folder, like /home/me/code.');
    expect(folderError('/tmp')).toBe('');
  });
  it('can be left empty when optional', () => {
    expect(folderError('', true)).toBe('');
    expect(folderError('x', true)).not.toBe('');
  });
  it('rejects control characters', () => {
    expect(folderError('/tmp/\u0000')).not.toBe('');
  });
});

describe('closeTarget', () => {
  it('closes the pane when the tab has others', () => {
    expect(closeTarget(loc())).toEqual({ kind: 'pane', id: 'p1', label: 'pane' });
  });
  it('closes the tab when the pane is its only one', () => {
    expect(closeTarget(loc({ paneCount: 1 }))).toEqual({ kind: 'tab', id: 'tb1', label: 'tab' });
  });
  it('closes the project when it is the last tab with a single pane', () => {
    expect(closeTarget(loc({ paneCount: 1, tabCount: 1 }))).toEqual({ kind: 'space', id: 's1', label: 'project' });
  });
  it('closes the tab when the terminal has no pane id', () => {
    expect(closeTarget(loc({ paneId: null }))).toEqual({ kind: 'tab', id: 'tb1', label: 'tab' });
  });
});

describe('spaceTerminals', () => {
  it('counts the terminals of every tab', () => {
    const space: Space = {
      id: 's',
      name: 'S',
      tabs: [
        { id: 'a', name: '', addresses: ['t1', 't2'], panes: [] },
        { id: 'b', name: '', addresses: ['t3'], panes: [] },
      ],
    };
    expect(spaceTerminals(space)).toBe(3);
  });
});

describe('closeCopy', () => {
  it('names the project and counts its terminals', () => {
    expect(closeCopy({ kind: 'space', id: 's', label: 'project' }, 'Work', 3)).toEqual({
      title: 'Close Work?',
      description: 'Close Work and end its 3 terminals? This cannot be undone.',
      action: 'Close project',
    });
  });
  it('uses the singular for one terminal', () => {
    expect(closeCopy({ kind: 'tab', id: 't', label: 'tab' }, 'Claude', 1).description).toBe(
      'Close Claude and end its 1 terminal? This cannot be undone.',
    );
  });
  it('closes a pane without naming it', () => {
    expect(closeCopy({ kind: 'pane', id: 'p', label: 'pane' }, 'Claude', 1)).toEqual({
      title: 'Close pane?',
      description: 'Close this pane and end its terminal? This cannot be undone.',
      action: 'Close pane',
    });
  });
});

describe('homeFolder', () => {
  it('finds the home folder from a working directory', () => {
    expect(homeFolder(['/etc', '/home/me/code/app'])).toBe('/home/me');
    expect(homeFolder(['/Users/me/x'])).toBe('/Users/me');
  });
  it('falls back to the first folder, or nothing', () => {
    expect(homeFolder(['/srv/app'])).toBe('/srv/app');
    expect(homeFolder([])).toBe('');
  });
});
